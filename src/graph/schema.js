import { gql } from 'graphql-tag';

export const typeDefs = gql`
  # Scalar types for custom handling
  scalar Date
  scalar DateTime
  scalar JSON

  # Pagination types
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
    totalCount: Int!
  }

  # User type with comprehensive fields
  type User {
    id: ID!
    tenantId: ID!
    username: String!
    email: String!
    role: UserRole!
    phoneNumber: String
    isPhoneVerified: Boolean!
    twoFactorMethod: TwoFactorMethod
    preferences: JSON!
    recommendationsOptOut: Boolean!
    createdAt: DateTime!
    deletedAt: DateTime
    deletedBy: ID
    # OAuth accounts
    oauthProviders: [OAuthProvider!]!
    # Activity logs for this user
    activityLogs(first: Int, after: String, before: String, last: Int): ActivityLogConnection!
    # Records created by this user
    records(first: Int, after: String, before: String, last: Int): RecordConnection!
  }

  type OAuthProvider {
    provider: String!
    email: String
    name: String
    linkedAt: DateTime!
  }

  enum UserRole {
    patient
    doctor
    educator
    admin
  }

  enum TwoFactorMethod {
    sms
    totp
  }

  # Record type with file attachments
  type Record {
    id: ID!
    tenantId: ID!
    patientName: String!
    date: DateTime!
    diagnosis: String
    treatment: String
    history: String
    txHash: String!
    clientUUID: String!
    syncTimestamp: DateTime!
    files: [RecordFile!]!
    createdBy: User!
    createdAt: DateTime!
    updatedAt: DateTime!
    deletedAt: DateTime
    deletedBy: ID
  }

  type RecordFile {
    cid: String!
    fileName: String!
    fileType: String!
    uploadedAt: DateTime!
  }

  # ActivityLog type for audit trail
  type ActivityLog {
    id: ID!
    userId: ID!
    user: User!
    action: ActivityAction!
    metadata: JSON!
    ipAddress: String
    userAgent: String
    resourceType: String
    resourceId: String
    result: ActivityResult!
    errorMessage: String
    sessionId: String
    requestId: String
    duration: Int
    timestamp: DateTime!
    expiresAt: DateTime
  }

  enum ActivityAction {
    login
    logout
    login_failed
    password_reset_request
    password_reset_complete
    two_factor_enabled
    two_factor_disabled
    two_factor_verified
    record_create
    record_update
    record_delete
    record_view
    record_download
    record_export
    user_create
    user_update
    user_delete
    user_role_change
    user_status_change
    contract_interaction
    transaction_submit
    transaction_confirm
    file_upload
    file_download
    file_delete
    file_scan
    admin_access
    backup_create
    backup_restore
    system_config_change
    gdpr_export_request
    gdpr_delete_request
    gdpr_data_export
    gdpr_data_deletion
    inventory_create
    inventory_update
    inventory_adjust
    inventory_consume
    prescription_create
    prescription_verify
    prescription_reject
    prescription_view
    payment_create
    payment_complete
    payment_failed
    payment_refund
    api_access
    data_access
    system_error
  }

  enum ActivityResult {
    success
    failure
    partial
  }

  # Connection types for cursor-based pagination
  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
  }

  type UserEdge {
    node: User!
    cursor: String!
  }

  type RecordConnection {
    edges: [RecordEdge!]!
    pageInfo: PageInfo!
  }

  type RecordEdge {
    node: Record!
    cursor: String!
  }

  type ActivityLogConnection {
    edges: [ActivityLogEdge!]!
    pageInfo: PageInfo!
  }

  type ActivityLogEdge {
    node: ActivityLog!
    cursor: String!
  }

  # Input types for mutations and filtering
  input UserCreateInput {
    username: String!
    email: String!
    password: String
    role: UserRole!
    phoneNumber: String
    preferences: JSON
  }

  input UserUpdateInput {
    username: String
    email: String
    role: UserRole
    phoneNumber: String
    preferences: JSON
    recommendationsOptOut: Boolean
  }

  input RecordCreateInput {
    patientName: String!
    date: DateTime
    diagnosis: String!
    treatment: String!
    history: String
    txHash: String!
    clientUUID: String!
    syncTimestamp: DateTime!
    files: [RecordFileInput!]
  }

  input RecordUpdateInput {
    patientName: String
    date: DateTime
    diagnosis: String
    treatment: String
    history: String
    files: [RecordFileInput!]
  }

  input RecordFileInput {
    cid: String!
    fileName: String!
    fileType: String!
  }

  input ActivityLogFilter {
    userId: ID
    action: ActivityAction
    result: ActivityResult
    resourceType: String
    resourceId: String
    startDate: DateTime
    endDate: DateTime
    ipAddress: String
    sessionId: String
  }

  # Analytics types
  type UserActivityStats {
    totalActivities: Int!
    uniqueUserCount: Int!
    successCount: Int!
    failureCount: Int!
    successRate: Float!
    avgDuration: Float!
  }

  type RegistrationTrend {
    date: String!
    count: Int!
  }

  type RoleDistribution {
    role: UserRole!
    count: Int!
  }

  # Queries
  type Query {
    # User queries
    users(
      first: Int
      after: String
      before: String
      last: Int
      role: UserRole
      tenantId: ID
    ): UserConnection!
    user(id: ID!): User
    me: User

    # Record queries
    records(
      first: Int
      after: String
      before: String
      last: Int
      patientName: String
      createdBy: ID
      tenantId: ID
      startDate: DateTime
      endDate: DateTime
    ): RecordConnection!
    record(id: ID!): Record

    # Activity log queries
    activityLogs(
      first: Int
      after: String
      before: String
      last: Int
      filter: ActivityLogFilter
    ): ActivityLogConnection!
    activityLog(id: ID!): ActivityLog

    # Analytics queries
    userActivityStats(
      userId: ID
      startDate: DateTime
      endDate: DateTime
    ): UserActivityStats!
    registrationTrends(startDate: DateTime!, endDate: DateTime!): [RegistrationTrend!]!
    roleDistribution: [RoleDistribution!]!

    # Legacy queries for backward compatibility
    appointments: [Appointment]
    vitalsMetrics(patientId: ID, bucket: String, range: DateRangeInput): VitalsMetrics
  }

  # Mutations
  type Mutation {
    # User mutations
    createUser(input: UserCreateInput!): User!
    updateUser(id: ID!, input: UserUpdateInput!): User!
    deleteUser(id: ID!): Boolean!
    
    # Record mutations
    createRecord(input: RecordCreateInput!): Record!
    updateRecord(id: ID!, input: RecordUpdateInput!): Record!
    deleteRecord(id: ID!): Boolean!

    # Activity log mutations (typically created automatically)
    logActivity(action: ActivityAction!, metadata: JSON): ActivityLog!

    # Bulk operations
    bulkCreateRecords(records: [RecordCreateInput!]!): [Record!]!
    bulkDeleteRecords(recordIds: [ID!]!): Boolean!
  }

  # Legacy types for backward compatibility
  type Appointment {
    id: ID!
    date: String
    doctor: String
    patient: String
  }

  type VitalsPoint {
    bucket: String
    avgHeartRate: Float
    avgSystolic: Float
    avgDiastolic: Float
    avgTemperatureC: Float
    avgSpo2: Float
    avgRespiratoryRate: Float
    count: Int
  }

  type HeatCell {
    dow: Int
    hour: Int
    avgHeartRate: Float
    count: Int
  }

  type VitalsMetrics {
    bucket: String!
    range: Range!
    series: [VitalsPoint!]!
    heatmap: [HeatCell!]!
  }

  input DateRangeInput {
    from: String
    to: String
  }

  type Range {
    from: String!
    to: String!
  }
`;
