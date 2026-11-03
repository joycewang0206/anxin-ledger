import { signOutAction } from "@/app/auth/actions";

export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <button type="submit" className="btn btn-secondary w-full">
        🔒 登出
      </button>
    </form>
  );
}
