import type {
  NewNotification,
  NotificationPageQuery,
  NotificationRecord,
  NotificationsRepository,
  TypeReadCount,
} from './notifications.repository';

const byNewestFirst = (a: NotificationRecord, b: NotificationRecord) =>
  b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);

function matches(record: NotificationRecord, query: NotificationPageQuery): boolean {
  const ofUser = record.userId === query.userId;
  const ofType = !query.types || query.types.includes(record.type);
  return ofUser && ofType && !(query.unreadOnly && record.isRead);
}

export class InMemoryNotificationsRepository implements NotificationsRepository {
  readonly records: NotificationRecord[] = [];
  private sequence = 0;

  seed(
    record: Partial<NotificationRecord> & Pick<NotificationRecord, 'userId'>,
  ): NotificationRecord {
    this.sequence += 1;
    const full: NotificationRecord = {
      id: `0199b000-0000-7000-8000-${String(this.sequence).padStart(12, '0')}`,
      title: `Aviso ${this.sequence}`,
      message: 'Mensagem',
      type: 'GLOBAL',
      referenceLink: null,
      isRead: false,
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, this.sequence)),
      ...record,
    };
    this.records.push(full);
    return full;
  }

  create(notification: NewNotification): Promise<NotificationRecord> {
    return Promise.resolve(this.seed({ ...notification, createdAt: new Date() }));
  }

  findPage(query: NotificationPageQuery): Promise<NotificationRecord[]> {
    const sorted = this.records.filter((record) => matches(record, query)).sort(byNewestFirst);
    const start = query.cursor ? sorted.findIndex(({ id }) => id === query.cursor) + 1 : 0;
    return Promise.resolve(sorted.slice(start, start + query.limit + 1));
  }

  countByType(userId: string): Promise<TypeReadCount[]> {
    const counts = new Map<string, TypeReadCount>();
    this.records
      .filter((record) => record.userId === userId)
      .forEach(({ type, isRead }) => {
        const key = `${type}:${String(isRead)}`;
        const current = counts.get(key) ?? { type, isRead, count: 0 };
        counts.set(key, { ...current, count: current.count + 1 });
      });
    return Promise.resolve([...counts.values()]);
  }

  markAsRead(userId: string, id: string): Promise<NotificationRecord | null> {
    const record = this.records.find((item) => item.id === id && item.userId === userId);
    if (record) record.isRead = true;
    return Promise.resolve(record ?? null);
  }

  findByGlobalNotification(): Promise<NotificationRecord[]> {
    return Promise.resolve(this.records.filter(({ type }) => type === 'GLOBAL'));
  }
}
