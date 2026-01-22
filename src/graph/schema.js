import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Record {
    id: ID!
    diagnosis: String
    treatment: String
    anchoredAt: String
  }

  type Appointment {
    id: ID!
    date: String
    doctor: String
    patient: String
  }

  type User {
    id: ID!
    name: String
    role: String
    email: String
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

  type Query {
    record(id: ID!): Record
    appointments: [Appointment]
    me: User
    vitalsMetrics(patientId: ID, bucket: String, range: DateRangeInput): VitalsMetrics
  }
`;