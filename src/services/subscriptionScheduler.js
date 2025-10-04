const cron = require('node-cron');

class SubscriptionScheduler {
  constructor(subscriptionsMap, paymentProvider) {
    this.subscriptions = subscriptionsMap;
    this.provider = paymentProvider;
    this.jobs = [];
  }

  // Check for renewals every hour
  startRenewalCheck() {
    const job = cron.schedule('0 * * * *', async () => {
      console.log('Running renewal check...');
      await this.checkRenewals();
    });

    this.jobs.push(job);
    console.log('Renewal scheduler started');
    return job;
  }

  // Check subscription statuses every 15 minutes
  startStatusSync() {
    const job = cron.schedule('*/15 * * * *', async () => {
      console.log('Syncing subscription statuses...');
      await this.syncStatuses();
    });

    this.jobs.push(job);
    console.log('Status sync scheduler started');
    return job;
  }

  async checkRenewals() {
    const now = new Date();

    for (const [id, subscription] of this.subscriptions.entries()) {
      try {
        // Check if subscription is ending soon (within 24 hours)
        const timeUntilEnd = subscription.currentPeriodEnd.getTime() - now.getTime();
        const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);

        if (hoursUntilEnd <= 24 && hoursUntilEnd > 0) {
          console.log(`Subscription ${id} renewing soon`);

          if (subscription.cancelAtPeriodEnd) {
            // Mark as canceled
            subscription.status = SubscriptionStatus.CANCELED;
            subscription.canceledAt = subscription.currentPeriodEnd;
          } else {
            // Attempt renewal
            await this.processRenewal(subscription);
          }

          subscription.metadata.lastSyncAt = now;
          this.subscriptions.set(id, subscription);
        }

        // Check if trial is ending
        if (subscription.trialEnd && subscription.status === SubscriptionStatus.TRIALING) {
          const trialTimeLeft = subscription.trialEnd.getTime() - now.getTime();
          if (trialTimeLeft <= 0) {
            subscription.status = SubscriptionStatus.ACTIVE;
            console.log(`Subscription ${id} trial ended, now active`);
            this.subscriptions.set(id, subscription);
          }
        }
      } catch (error) {
        console.error(`Error checking renewal for subscription ${id}:`, error);
      }
    }
  }

  async processRenewal(subscription) {
    try {
      // Simulate payment processing
      const success = Math.random() > 0.1; // 90% success rate

      if (success) {
        // Extend subscription period
        const newPeriodStart = subscription.currentPeriodEnd;
        const newPeriodEnd = new Date(newPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

        subscription.currentPeriodStart = newPeriodStart;
        subscription.currentPeriodEnd = newPeriodEnd;
        subscription.status = SubscriptionStatus.ACTIVE;
        
        console.log(`Subscription ${subscription.id} renewed successfully`);
      } else {
        subscription.status = SubscriptionStatus.PAST_DUE;
        console.log(`Subscription ${subscription.id} renewal failed - past due`);
      }

      subscription.metadata.syncedWithProvider = true;
      subscription.metadata.lastRenewalAttempt = new Date();
    } catch (error) {
      subscription.status = SubscriptionStatus.PAST_DUE;
      throw error;
    }
  }

  async syncStatuses() {
    for (const [id, subscription] of this.subscriptions.entries()) {
      try {
        // Fetch latest status from provider
        const providerSub = await this.provider.retrieveSubscription(
          subscription.providerSubscriptionId
        );

        // Update if status changed
        if (providerSub.status !== subscription.status) {
          console.log(`Status sync: ${id} changed from ${subscription.status} to ${providerSub.status}`);
          subscription.status = providerSub.status;
          subscription.metadata.syncedWithProvider = true;
          subscription.metadata.lastSyncAt = new Date();
          this.subscriptions.set(id, subscription);
        }
      } catch (error) {
        console.error(`Error syncing status for subscription ${id}:`, error);
        subscription.metadata.syncedWithProvider = false;
        subscription.metadata.lastSyncError = error.message;
      }
    }
  }

  stopAll() {
    this.jobs.forEach(job => job.stop());
    console.log('All schedulers stopped');
  }
}

module.exports = SubscriptionScheduler;