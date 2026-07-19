import ctypes
import errno
import functools
import json
import math
import os
import resource
import signal
import subprocess
import tempfile
import time
from collections.abc import Mapping, Sequence
from pathlib import Path, PurePosixPath
from typing import ClassVar, TypeGuard, cast

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.parsers.adapter import (
    CompatibilityResult,
    ParserResult,
)
from pal_hatch_helper.repositories.database import JSONValue

_SCMP_ACT_ALLOW = 0x7FFF0000
_SCMP_ACT_ERRNO = 0x00050000
_SCMP_CMP_MASKED_EQ = 7
_CLONE_THREAD = 0x00010000
_PR_SET_NO_NEW_PRIVS = 38
_LANDLOCK_CREATE_RULESET_VERSION = 1
_LANDLOCK_RULE_PATH_BENEATH = 1
_LANDLOCK_ACCESS_FS_EXECUTE = 1 << 0
_LANDLOCK_ACCESS_FS_WRITE_FILE = 1 << 1
_LANDLOCK_ACCESS_FS_READ_FILE = 1 << 2
_LANDLOCK_ACCESS_FS_READ_DIR = 1 << 3
_LANDLOCK_ACCESS_FS_REMOVE_DIR = 1 << 4
_LANDLOCK_ACCESS_FS_REMOVE_FILE = 1 << 5
_LANDLOCK_ACCESS_FS_MAKE_CHAR = 1 << 6
_LANDLOCK_ACCESS_FS_MAKE_DIR = 1 << 7
_LANDLOCK_ACCESS_FS_MAKE_REG = 1 << 8
_LANDLOCK_ACCESS_FS_MAKE_SOCK = 1 << 9
_LANDLOCK_ACCESS_FS_MAKE_FIFO = 1 << 10
_LANDLOCK_ACCESS_FS_MAKE_BLOCK = 1 << 11
_LANDLOCK_ACCESS_FS_MAKE_SYM = 1 << 12
_LANDLOCK_ACCESS_FS_REFER = 1 << 13
_LANDLOCK_ACCESS_FS_TRUNCATE = 1 << 14
_LANDLOCK_READ_ACCESS = (
    _LANDLOCK_ACCESS_FS_EXECUTE | _LANDLOCK_ACCESS_FS_READ_FILE | _LANDLOCK_ACCESS_FS_READ_DIR
)
_LANDLOCK_WRITE_ACCESS = (
    _LANDLOCK_ACCESS_FS_WRITE_FILE
    | _LANDLOCK_ACCESS_FS_REMOVE_DIR
    | _LANDLOCK_ACCESS_FS_REMOVE_FILE
    | _LANDLOCK_ACCESS_FS_MAKE_CHAR
    | _LANDLOCK_ACCESS_FS_MAKE_DIR
    | _LANDLOCK_ACCESS_FS_MAKE_REG
    | _LANDLOCK_ACCESS_FS_MAKE_SOCK
    | _LANDLOCK_ACCESS_FS_MAKE_FIFO
    | _LANDLOCK_ACCESS_FS_MAKE_BLOCK
    | _LANDLOCK_ACCESS_FS_MAKE_SYM
    | _LANDLOCK_ACCESS_FS_REFER
    | _LANDLOCK_ACCESS_FS_TRUNCATE
)
_DENIED_PROCESS_SYSCALLS = (
    "fork",
    "vfork",
)
_DENIED_NETWORK_SYSCALLS = (
    "socket",
    "socketpair",
    "connect",
    "accept",
    "accept4",
    "bind",
    "listen",
    "sendto",
    "recvfrom",
    "sendmsg",
    "recvmsg",
)
_DENIED_MUTATION_SYSCALLS = (
    "chmod",
    "fchmod",
    "fchmodat",
    "fchmodat2",
)
_ALLOWED_PARSER_ENVIRONMENT = frozenset(
    {
        "PALHATCH_OODLE_LIB",
        "PALHATCH_OODLE_SHA256",
        "PALHATCH_WORLD_UID",
    }
)


class _ScmpArgCmp(ctypes.Structure):
    _fields_: ClassVar = [
        ("arg", ctypes.c_uint),
        ("op", ctypes.c_int),
        ("datum_a", ctypes.c_uint64),
        ("datum_b", ctypes.c_uint64),
    ]


class SubprocessParserAdapter:
    def __init__(
        self,
        *,
        name: str,
        version: str,
        command: Sequence[str],
        declared_files: Sequence[PurePosixPath],
        timeout_seconds: float = 180,
        memory_limit_bytes: int = 1536 * 1024 * 1024,
        cpu_limit_seconds: int = 180,
        max_output_bytes: int = 64 * 1024 * 1024,
        disable_network: bool = True,
        runtime_read_paths: Sequence[Path] = (),
        environment: Mapping[str, str] | None = None,
    ) -> None:
        if not name or not version or not command or not declared_files:
            raise ValueError("Parser identity, command, and declared files are required")
        self.name = name
        self.version = version
        self._command = tuple(command)
        self._declared_files = tuple(declared_files)
        self._timeout_seconds = timeout_seconds
        self._memory_limit_bytes = memory_limit_bytes
        self._cpu_limit_seconds = cpu_limit_seconds
        self._max_output_bytes = max_output_bytes
        self._disable_network = disable_network
        self._runtime_read_paths = tuple(runtime_read_paths)
        parser_environment = dict(environment or {})
        if any(key not in _ALLOWED_PARSER_ENVIRONMENT for key in parser_environment):
            raise ValueError("Parser environment keys must be explicitly allowlisted")
        if any("\0" in value or len(value) > 4096 for value in parser_environment.values()):
            raise ValueError("Parser environment values must be bounded strings")
        self._environment = parser_environment

    def required_files(self) -> tuple[PurePosixPath, ...]:
        return self._declared_files

    def detect_compatibility(self, snapshot_path: Path) -> CompatibilityResult:
        compatible = all(
            snapshot_path.joinpath(*relative.parts).is_file()
            and not snapshot_path.joinpath(*relative.parts).is_symlink()
            for relative in self._declared_files
        )
        return CompatibilityResult(
            compatible=compatible,
            reason_code=None if compatible else "PARSER_REQUIRED_FILE_MISSING",
        )

    def parse(self, snapshot_path: Path, output_path: Path) -> ParserResult:
        snapshot = snapshot_path.resolve(strict=True)
        output_parent = output_path.parent.resolve(strict=True)
        if output_path.exists() or output_parent.is_relative_to(snapshot):
            raise _invalid_output()
        compatibility = self.detect_compatibility(snapshot)
        if not compatibility.compatible:
            raise StructuredError(
                code=ErrorCode.PARSER_INCOMPATIBLE,
                summary="ParserAdapter is incompatible with the declared snapshot files.",
                retryable=False,
            )

        started = time.monotonic()
        with tempfile.TemporaryDirectory(
            prefix=".parser-output-",
            dir=output_parent,
        ) as sandbox_output_directory:
            sandbox_output_parent = Path(sandbox_output_directory)
            sandbox_output_path = sandbox_output_parent / output_path.name
            command = tuple(
                argument.replace("{snapshot_path}", str(snapshot)).replace(
                    "{output_path}", str(sandbox_output_path)
                )
                for argument in self._command
            )
            try:
                process = subprocess.Popen(
                    command,
                    cwd=snapshot,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    env={
                        "HOME": str(sandbox_output_parent),
                        "LANG": "C.UTF-8",
                        "LC_ALL": "C.UTF-8",
                        "PYTHONDONTWRITEBYTECODE": "1",
                        "PYTHONUTF8": "1",
                        "TMPDIR": str(sandbox_output_parent),
                        **self._environment,
                    },
                    close_fds=True,
                    start_new_session=True,
                    preexec_fn=functools.partial(
                        self._child_limits,
                        snapshot,
                        sandbox_output_parent,
                        Path(command[0]),
                    ),
                )
            except (OSError, subprocess.SubprocessError) as error:
                raise StructuredError(
                    code=ErrorCode.PARSER_SANDBOX_FAILED,
                    summary="Parser subprocess sandbox could not be established.",
                    retryable=False,
                ) from error
            try:
                process.communicate(timeout=self._timeout_seconds)
            except subprocess.TimeoutExpired as error:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
                raise StructuredError(
                    code=ErrorCode.PARSER_TIMEOUT,
                    summary="Parser subprocess exceeded its configured timeout.",
                    retryable=True,
                ) from error
            if process.returncode != 0:
                raise StructuredError(
                    code=ErrorCode.PARSER_EXIT_NONZERO,
                    summary="Parser subprocess exited unsuccessfully.",
                    retryable=False,
                )
            try:
                if not _output_directory_within_limit(
                    sandbox_output_parent,
                    self._max_output_bytes,
                ):
                    raise OSError("parser aggregate output exceeds configured size")
                if sandbox_output_path.is_symlink():
                    raise OSError("parser output cannot be a symlink")
                output_size = sandbox_output_path.stat().st_size
                if output_size > self._max_output_bytes:
                    raise OSError("parser output exceeds configured size")
                decoded = cast(
                    object,
                    json.loads(sandbox_output_path.read_text(encoding="utf-8")),
                )
                if not _is_json_object(decoded):
                    raise OSError("parser output must be a JSON object")
                os.link(sandbox_output_path, output_path, follow_symlinks=False)
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                raise _invalid_output() from error
        if not _is_json_object(decoded):
            raise _invalid_output()
        return ParserResult(
            output_path=output_path,
            payload=decoded,
            duration_seconds=time.monotonic() - started,
        )

    def _child_limits(
        self,
        snapshot: Path,
        output_parent: Path,
        executable: Path,
    ) -> None:
        os.umask(0o077)
        memory = max(self._memory_limit_bytes, 1)
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        cpu = max(math.ceil(self._cpu_limit_seconds), 1)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
        file_size = max(self._max_output_bytes, 1)
        resource.setrlimit(resource.RLIMIT_FSIZE, (file_size, file_size))
        try:
            affinity = os.sched_getaffinity(0)
            os.sched_setaffinity(0, {min(affinity)})
        except (AttributeError, OSError, ValueError):
            pass
        _install_landlock(
            snapshot=snapshot,
            output_parent=output_parent,
            executable=executable,
            runtime_read_paths=self._runtime_read_paths,
        )
        _install_seccomp_filter(disable_network=self._disable_network)


def _install_seccomp_filter(*, disable_network: bool) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "unable to set no_new_privs")
    seccomp = ctypes.CDLL("libseccomp.so.2", use_errno=True)
    seccomp.seccomp_init.argtypes = [ctypes.c_uint32]
    seccomp.seccomp_init.restype = ctypes.c_void_p
    seccomp.seccomp_rule_add.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_int,
        ctypes.c_uint,
    ]
    seccomp.seccomp_rule_add.restype = ctypes.c_int
    seccomp.seccomp_rule_add_array.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_int,
        ctypes.c_uint,
        ctypes.POINTER(_ScmpArgCmp),
    ]
    seccomp.seccomp_rule_add_array.restype = ctypes.c_int
    seccomp.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    seccomp.seccomp_syscall_resolve_name.restype = ctypes.c_int
    seccomp.seccomp_load.argtypes = [ctypes.c_void_p]
    seccomp.seccomp_load.restype = ctypes.c_int
    seccomp.seccomp_release.argtypes = [ctypes.c_void_p]
    context = seccomp.seccomp_init(_SCMP_ACT_ALLOW)
    if not context:
        raise OSError("unable to initialize seccomp")
    try:
        action = _SCMP_ACT_ERRNO | errno.EPERM
        denied_syscalls: tuple[str, ...] = _DENIED_PROCESS_SYSCALLS + _DENIED_MUTATION_SYSCALLS
        if disable_network:
            denied_syscalls += _DENIED_NETWORK_SYSCALLS
        for name in denied_syscalls:
            syscall = seccomp.seccomp_syscall_resolve_name(name.encode("ascii"))
            if syscall < 0:
                continue
            if seccomp.seccomp_rule_add(context, action, syscall, 0) != 0:
                raise OSError(f"unable to restrict syscall {name}")
        clone3_syscall = seccomp.seccomp_syscall_resolve_name(b"clone3")
        if clone3_syscall >= 0:
            unsupported_action = _SCMP_ACT_ERRNO | errno.ENOSYS
            if seccomp.seccomp_rule_add(context, unsupported_action, clone3_syscall, 0) != 0:
                raise OSError("unable to restrict syscall clone3")
        clone_syscall = seccomp.seccomp_syscall_resolve_name(b"clone")
        if clone_syscall >= 0:
            process_clone = _ScmpArgCmp(
                arg=0,
                op=_SCMP_CMP_MASKED_EQ,
                datum_a=_CLONE_THREAD,
                datum_b=0,
            )
            if (
                seccomp.seccomp_rule_add_array(
                    context,
                    action,
                    clone_syscall,
                    1,
                    ctypes.byref(process_clone),
                )
                != 0
            ):
                raise OSError("unable to restrict process-form clone")
        if seccomp.seccomp_load(context) != 0:
            raise OSError(ctypes.get_errno(), "unable to load seccomp filter")
    finally:
        seccomp.seccomp_release(context)


def _output_directory_within_limit(output_parent: Path, limit: int) -> bool:
    total = 0
    pending = [output_parent]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                if entry.is_symlink():
                    return False
                if entry.is_dir(follow_symlinks=False):
                    pending.append(Path(entry.path))
                    continue
                if not entry.is_file(follow_symlinks=False):
                    return False
                total += entry.stat(follow_symlinks=False).st_size
                if total > limit:
                    return False
    return True


class _LandlockRulesetAttr(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]  # noqa: RUF012


class _LandlockPathBeneathAttr(ctypes.Structure):
    _fields_ = [  # noqa: RUF012
        ("allowed_access", ctypes.c_uint64),
        ("parent_fd", ctypes.c_int32),
    ]


def _install_landlock(
    *,
    snapshot: Path,
    output_parent: Path,
    executable: Path,
    runtime_read_paths: Sequence[Path],
) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    abi = libc.syscall(444, 0, 0, _LANDLOCK_CREATE_RULESET_VERSION)
    if abi < 3:
        raise OSError(errno.ENOSYS, "Landlock ABI 3 or newer is required")
    handled_access = _LANDLOCK_READ_ACCESS | _LANDLOCK_WRITE_ACCESS
    ruleset_attr = _LandlockRulesetAttr(handled_access_fs=handled_access)
    ruleset_fd = libc.syscall(444, ctypes.byref(ruleset_attr), ctypes.sizeof(ruleset_attr), 0)
    if ruleset_fd < 0:
        raise OSError(ctypes.get_errno(), "unable to create Landlock ruleset")
    try:
        standard_runtime_paths = (
            Path("/bin"),
            Path("/dev/urandom"),
            Path("/etc"),
            Path("/lib"),
            Path("/lib64"),
            Path("/usr"),
        )
        configured_executable = executable.absolute()
        executable_path = executable.resolve(strict=True)
        runtime_library = executable_path.parent.parent / "lib"
        read_paths = {
            snapshot,
            executable_path,
            executable_path.parent,
            *runtime_read_paths,
            *(path for path in standard_runtime_paths if path.exists()),
        }
        if runtime_library.is_dir():
            read_paths.add(runtime_library)
        virtual_environment = configured_executable.parent.parent
        if (virtual_environment / "pyvenv.cfg").is_file():
            read_paths.add(virtual_environment)
        for path in read_paths:
            _add_landlock_path_rule(
                libc, ruleset_fd, path.resolve(strict=True), _LANDLOCK_READ_ACCESS
            )
        _add_landlock_path_rule(
            libc,
            ruleset_fd,
            output_parent,
            _LANDLOCK_READ_ACCESS | _LANDLOCK_WRITE_ACCESS,
        )
        libc.prctl.restype = ctypes.c_int
        if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "unable to set no_new_privs")
        if libc.syscall(446, ruleset_fd, 0) != 0:
            raise OSError(ctypes.get_errno(), "unable to apply Landlock ruleset")
    finally:
        os.close(ruleset_fd)


def _add_landlock_path_rule(
    libc: ctypes.CDLL,
    ruleset_fd: int,
    path: Path,
    access: int,
) -> None:
    if not path.is_dir():
        access &= ~_LANDLOCK_ACCESS_FS_READ_DIR
        access &= ~(
            _LANDLOCK_ACCESS_FS_REMOVE_DIR
            | _LANDLOCK_ACCESS_FS_MAKE_CHAR
            | _LANDLOCK_ACCESS_FS_MAKE_DIR
            | _LANDLOCK_ACCESS_FS_MAKE_REG
            | _LANDLOCK_ACCESS_FS_MAKE_SOCK
            | _LANDLOCK_ACCESS_FS_MAKE_FIFO
            | _LANDLOCK_ACCESS_FS_MAKE_BLOCK
            | _LANDLOCK_ACCESS_FS_MAKE_SYM
            | _LANDLOCK_ACCESS_FS_REFER
        )
    descriptor = os.open(path, os.O_PATH | os.O_CLOEXEC)
    try:
        path_attr = _LandlockPathBeneathAttr(allowed_access=access, parent_fd=descriptor)
        if (
            libc.syscall(
                445,
                ruleset_fd,
                _LANDLOCK_RULE_PATH_BENEATH,
                ctypes.byref(path_attr),
                0,
            )
            != 0
        ):
            raise OSError(ctypes.get_errno(), f"unable to allow parser path {path}")
    finally:
        os.close(descriptor)


def _is_json_value(value: object) -> TypeGuard[JSONValue]:
    if value is None or isinstance(value, str | int | float | bool):
        return True
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_value(item) for key, item in value.items())
    return False


def _is_json_object(value: object) -> TypeGuard[dict[str, JSONValue]]:
    return isinstance(value, dict) and _is_json_value(value)


def _invalid_output() -> StructuredError:
    return StructuredError(
        code=ErrorCode.PARSER_OUTPUT_INVALID,
        summary="Parser output is missing, oversized, or not a valid JSON object.",
        retryable=False,
    )
