export function isSuperAdmin(user: any): boolean {
  return user.roles?.some((r: any) => r.isSuperAdmin);
}
