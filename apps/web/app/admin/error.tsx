"use client";

import { PageError } from "@/components/states/page-error";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <PageError
      code="ADMIN_DATA_UNAVAILABLE"
      title="管理员数据暂不可用"
      description="安全边界已保持；页面没有回退到跨用户缓存或高权限密钥。"
      headingLevel="h1"
      className="mx-auto max-w-2xl"
      action={
        <Button variant="outline" onClick={reset} type="button">
          重试
        </Button>
      }
    />
  );
}
