import { leaveHouseholdAction, regenerateCodeAction, removeMemberAction } from "@/app/household/actions";
import type { Membership, User } from "@/lib/context";
import { formatInviteCode, type MemberRow } from "@/lib/services/household";

export function HouseholdPanel({ me, user, members }: { me: Membership; user: User; members: MemberRow[] }) {
  const owner = me.role === "owner";
  return (
    <div className="card max-w-[34rem]">
      <p className="font-bold">家庭：{me.householdName}</p>
      <p className="mt-3 font-bold">邀請碼（給要加入的家人）</p>
      <p className="num my-1 select-all tracking-wider" aria-label="邀請碼">{formatInviteCode(me.inviteCode)}</p>
      <p className="muted mb-3">家人註冊後，選「輸入邀請碼加入」即可一起記帳。邀請碼只給信任的家人，不要貼在公開的地方。</p>
      {owner && (
        <form action={regenerateCodeAction} className="mb-4">
          <button type="submit" className="btn btn-secondary">更換邀請碼（舊的立刻失效）</button>
        </form>
      )}
      <p className="mb-1 font-bold">目前成員（{members.length} 人）</p>
      <ul className="mb-3 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 rounded-xl border-2 border-gray-300 p-3">
            <span className="font-bold">
              {m.displayName}
              {m.userId === user.id ? "（你）" : ""}
              {m.role === "owner" ? " · 管理者" : ""}
            </span>
            {owner && m.userId !== user.id && (
              <form action={removeMemberAction}>
                <input type="hidden" name="userId" value={m.userId} />
                <button type="submit" className="btn btn-secondary">移除</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {!owner && (
        <form action={leaveHouseholdAction}>
          <button type="submit" className="btn btn-secondary">離開這個家庭</button>
        </form>
      )}
      <p className="muted mt-3">被移除或離開的人，立刻看不到這個家庭的任何資料；記帳資料會留在家庭裡。</p>
    </div>
  );
}
