export interface NotificationStrategy {
  deliver(payload: unknown): Promise<void>;
}
