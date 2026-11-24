/** Room pessoal: todo socket autenticado entra nela, e é por ela que o servidor fala com um usuário. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
