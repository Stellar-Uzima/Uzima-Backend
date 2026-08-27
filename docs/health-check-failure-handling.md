# Health Check Failure Handling - Uzima-Backend

## Overview
This document describes how health check failures are surfaced to upstream orchestrators and the expected retry/failover behavior for the Uzima-Backend application.

## Current Health Check Implementation
The application uses NestJS Terminus to implement comprehensive health monitoring exposed at the `/health` endpoint. Three critical dependencies are monitored:
1. **PostgreSQL Database** (TypeORM)
2. **Redis Cache** (ioredis)
3. **BullMQ Message Queues** (all application queues)

## How Failures Are Surfaced to Orchestrators

### Standard HTTP Status Codes
- **200 OK**: All health checks pass, application is healthy
- **503 Service Unavailable**: One or more health checks failed, application is unhealthy

### Enhanced Health Response Format
The health endpoint now returns detailed metrics for monitoring and debugging:

#### Success Response
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "message": "Database connection is healthy",
      "timestamp": "2026-07-29T12:00:00.000Z"
    },
    "redis": {
      "status": "up",
      "keys": 1542,
      "memory": "25.6M",
      "hits": 85420,
      "misses": 4210,
      "hitRate": 0.953,
      "message": "Redis connection is healthy",
      "timestamp": "2026-07-29T12:00:00.000Z"
    },
    "queue": {
      "status": "up",
      "queues": {
        "reward-queue": { "waiting": 5, "active": 2, "completed": 1250, "failed": 3, "delayed": 0, "paused": 0 },
        "notification-queue": { "waiting": 12, "active": 1, "completed": 890, "failed": 1, "delayed": 2, "paused": 0 }
      },
      "message": "All queue connections are healthy",
      "timestamp": "2026-07-29T12:00:00.000Z"
    }
  }
}
```

#### Failure Response
```json
{
  "status": "error",
  "error": {
    "redis": {
      "status": "down",
      "error": "Connection refused",
      "timestamp": "2026-07-29T12:00:00.000Z"
    }
  }
}
```

## Orchestrator Configuration

### Docker Compose (Current Implementation)
The application already includes health check configuration in `docker-compose.yml`:
- Postgres health check: 10s interval, 5s timeout, 5 retries
- Redis health check: 10s interval, 5s timeout, 5 retries
- App health check (in Dockerfile): 30s interval, 10s timeout, 3 retries

### Kubernetes Configuration
For Kubernetes deployments, use the liveness and readiness probes defined in `k8s/deployment.yaml`:
- **Liveness Probe**: 30s interval, 10s timeout, 3 failures before restart
- **Readiness Probe**: 15s interval, 5s timeout, 2 failures before removing from rotation

## Retry and Failover Behavior

### Health Check Retry Logic
Upstream orchestrators implement the following retry strategy:
1. **Initial Delay**: 5-10 seconds to allow application startup
2. **Interval**: 30 seconds between health checks
3. **Timeout**: 10 seconds per check
4. **Failure Threshold**: 3 consecutive failures before marking as unhealthy

### What Happens When Health Checks Fail

#### Readiness Probe Failures
- Kubernetes stops sending traffic to the unhealthy pod
- Traffic is routed to other healthy replicas (minimum 2 required)
- The unhealthy pod continues running to allow for auto-recovery

#### Liveness Probe Failures
- After 3 consecutive failures, Kubernetes restarts the pod
- Handles unrecoverable failures where the application is stuck
- Ensures automatic recovery from fatal errors

### Graceful Shutdown
The application implements graceful shutdown in `ShutdownService`:
1. Stops accepting new requests
2. Closes all message queues properly
3. Flushes and closes Redis connections
4. Closes database connection pool
5. Logs all shutdown steps for debugging

## High Availability Setup
For production deployments:
- **Minimum 3 replicas** to ensure zero-downtime failover
- **Pod anti-affinity** to spread replicas across nodes
- **Pod Disruption Budget** to maintain minimum availability during voluntary disruptions
- **Load balancer** that only routes traffic to healthy pods

## Monitoring and Alerting
Alerting configuration is provided in `monitoring/health-alerts.yaml`:
1. **PodNotReady**: Alert if any pod fails readiness checks for >1 minute
2. **InsufficientBackendReplicas**: Alert if fewer than 2 pods are ready
3. **ApplicationHealthCheckFailed**: Alert if /health returns 503
4. **HighQueueBacklog**: Alert if waiting jobs exceed 100 across all queues
5. **LowRedisHitRate**: Alert if cache hit rate drops below 80%

## Changes Implemented
1. Added `ping()` methods to `CacheService` and `QueueService` for connectivity testing
2. Enhanced health indicators to return detailed metrics (Redis stats, queue backlogs)
3. Fixed module dependencies to properly import shared services
4. Added Kubernetes deployment example with proper health check configuration
5. Created Prometheus alerting rules for health monitoring
6. Added comprehensive documentation for failure handling

## Key Improvements
- **Granular Metrics**: Detailed statistics help identify bottlenecks before they cause outages
- **Standardized Responses**: Orchestrators get consistent health status information
- **Observability**: Enhanced logging and metrics enable faster debugging
- **Auto-Recovery**: Graceful shutdown and orchestrator policies ensure automatic recovery
- **High Availability**: Multi-replica deployment with proper failover handling