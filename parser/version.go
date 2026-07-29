package parserversion

import (
	_ "embed"
	"strings"
)

// versionText is the single Parser version source shared with release tooling.
//
//go:embed VERSION
var versionText string

// Version returns the normalized semantic version stored in VERSION.
func Version() string {
	return strings.TrimSpace(versionText)
}
