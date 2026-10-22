import Link from "next/link";

export function LocalPreviewNotice() {
  return (
    <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-muted/40 p-6 text-sm">
      <h2 className="text-lg font-semibold">本地界面预览</h2>
      <p className="text-muted-foreground">
        当前尚未配置 Supabase，登录、注册和画布保存暂不可用。AI 创作还需要模型 API Key。
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">返回首页</Link>
    </div>
  );
}
