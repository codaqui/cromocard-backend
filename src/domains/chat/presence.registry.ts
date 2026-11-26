export class PresenceRegistry {
  private readonly sockets = new Map<string, number>();

  connect(userId: string): boolean {
    const count = (this.sockets.get(userId) ?? 0) + 1;
    this.sockets.set(userId, count);
    return count === 1;
  }

  disconnect(userId: string): boolean {
    const count = (this.sockets.get(userId) ?? 0) - 1;
    if (count > 0) {
      this.sockets.set(userId, count);
      return false;
    }
    return this.sockets.delete(userId);
  }

  onlineAmong(userIds: readonly string[]): string[] {
    return userIds.filter((userId) => this.sockets.has(userId));
  }
}
