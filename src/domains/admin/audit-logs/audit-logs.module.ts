import { auditLogsRoutes, auditLogService } from './audit-logs.routes';

export const auditLogsModule = {
    basePath: '/admin/audit-logs',
    router: auditLogsRoutes,
    registerDocs: () => {
        
    }
}

export { auditLogService };