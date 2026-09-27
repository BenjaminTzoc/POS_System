export function isSuperAdmin(user: any): boolean {
  return user?.roles?.some((r: any) => r.isSuperAdmin);
}

export function isAdminUser(user: any): boolean {
  if (isSuperAdmin(user)) return true;
  return user?.roles?.some((r: any) => {
    const name = String(r?.name || r || '').toLowerCase();
    return name === 'admin' || name === 'administrador';
  });
}

