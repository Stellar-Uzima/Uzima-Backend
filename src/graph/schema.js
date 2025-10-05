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

  type Query {
    record(id: ID!): Record
    appointments: [Appointment]
    me: User
  }
`;