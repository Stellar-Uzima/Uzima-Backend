import { getAppointments, getAppointmentsForTomorrow } from '../models/appointmentModel.js';
import RecordModel from '../models/Record.js';
import UserModel from '../models/User.js';
import { getVitalsMetrics } from '../controllers/metrics.controller.js';

export const resolvers = {
  Query: {
    record: async (_, { id }, { user }) => {
      if (user.role !== 'doctor') throw new Error('Unauthorized');
      return await RecordModel.findById(id);
    },
    appointments: async (_, __, { user }) => {
      if (!['doctor', 'admin'].includes(user.role)) throw new Error('Unauthorized');
      return getAppointmentsForTomorrow();
    },
    me: async (_, __, { user }) => {
      return await UserModel.findById(user.id);
    },
    vitalsMetrics: async (_, args, ctx) => {
      const req = { query: {} };
      if (args.patientId) req.query.patientId = args.patientId;
      if (args.bucket) req.query.bucket = args.bucket;
      if (args.range?.from) req.query.from = args.range.from;
      if (args.range?.to) req.query.to = args.range.to;

      // Reuse REST controller to ensure consistent aggregation and caching
      return await new Promise((resolve, reject) => {
        const res = {
          json: (payload) => resolve(payload),
          status: () => ({ json: (e) => reject(e) }),
        };
        getVitalsMetrics(req, res);
      });
    },
  },
};
