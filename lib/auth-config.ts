export const DASHBOARD_OWNER_USER_ID =
  process.env.DASHBOARD_OWNER_USER_ID ?? "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

export function isDashboardOwner(userId: string): boolean {
  return userId === DASHBOARD_OWNER_USER_ID;
}
