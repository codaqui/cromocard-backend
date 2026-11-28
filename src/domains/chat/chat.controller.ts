import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, okWithMeta } from '@/shared/utils/http-response';

import type { ChatService } from './chat.service';
import {
  contactsQuerySchema,
  conversationIdParamSchema,
  listConversationsQuerySchema,
  messagesQuerySchema,
  startConversationSchema,
} from './chat.validator';

export class ChatController {
  constructor(private readonly service: ChatService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = listConversationsQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listConversations(
      getAuthenticatedUser(req).id,
      query,
    );
    okWithMeta(res, items, meta);
  };

  start = async (req: Request, res: Response): Promise<void> => {
    const { userId } = startConversationSchema.parse(req.body);
    const result = await this.service.startConversation(getAuthenticatedUser(req).id, userId);
    (result.created ? created : ok)(res, result.conversation);
  };

  messages = async (req: Request, res: Response): Promise<void> => {
    const { id } = conversationIdParamSchema.parse(req.params);
    const query = messagesQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listMessages(
      getAuthenticatedUser(req).id,
      id,
      query,
    );
    okWithMeta(res, items, meta);
  };

  read = async (req: Request, res: Response): Promise<void> => {
    const { id } = conversationIdParamSchema.parse(req.params);
    await this.service.markAsRead(getAuthenticatedUser(req).id, id);
    noContent(res);
  };

  contacts = async (req: Request, res: Response): Promise<void> => {
    const query = contactsQuerySchema.parse(req.query);
    ok(res, await this.service.listContacts(getAuthenticatedUser(req).id, query));
  };
}
