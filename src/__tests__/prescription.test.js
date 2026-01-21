import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import Prescription from '../models/Prescription.js';
import ActivityLog from '../models/ActivityLog.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Prescription Verification System', () => {
  let testDoctor;
  let testPatient;
  let testPharmacist;
  let doctorToken;
  let patientToken;
  let pharmacistToken;
  let testDoctorId;
  let testPatientId;
  let testPharmacistId;
  let createdPrescription;

  beforeAll(async () => {
    // Create test users
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    
    testDoctor = new User({
      username: 'testdoctor',
      email: 'testdoctor@example.com',
      password: hashedPassword,
      role: 'doctor',
    });
    await testDoctor.save();
    testDoctorId = testDoctor._id;

    testPatient = new User({
      username: 'testpatient',
      email: 'testpatient@example.com',
      password: hashedPassword,
      role: 'patient',
    });
    await testPatient.save();
    testPatientId = testPatient._id;

    testPharmacist = new User({
      username: 'testpharmacist',
      email: 'testpharmacist@example.com',
      password: hashedPassword,
      role: 'doctor', // Using doctor role for pharmacist
    });
    await testPharmacist.save();
    testPharmacistId = testPharmacist._id;

    // Generate JWT tokens
    doctorToken = jwt.sign(
      { id: testDoctorId.toString(), role: 'doctor' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    patientToken = jwt.sign(
      { id: testPatientId.toString(), role: 'patient' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    pharmacistToken = jwt.sign(
      { id: testPharmacistId.toString(), role: 'doctor' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await Prescription.deleteMany({});
    await ActivityLog.deleteMany({});
    await User.deleteMany({
      email: {
        $in: [
          'testdoctor@example.com',
          'testpatient@example.com',
          'testpharmacist@example.com',
        ],
      },
    });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up prescriptions before each test
    await Prescription.deleteMany({});
  });

  describe('POST /api/prescriptions - Create Prescription', () => {
    it('should create a prescription with QR code and signature', async () => {
      const prescriptionData = {
        patientName: 'John Doe',
        patientId: testPatientId.toString(),
        medications: [
          {
            name: 'Paracetamol',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '7 days',
            quantity: 14,
          },
        ],
        instructions: 'Take with food',
        expiryDays: 30,
      };

      const response = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(prescriptionData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.prescription).toBeDefined();
      expect(response.body.data.prescription.prescriptionNumber).toMatch(/^RX-/);
      expect(response.body.data.prescription.signature).toBeDefined();
      expect(response.body.data.prescription.qrCode).toBeDefined();
      expect(response.body.data.prescription.qrCode).toContain('data:image/png;base64');

      createdPrescription = response.body.data.prescription;
    });

    it('should reject prescription creation without authentication', async () => {
      const response = await request(app)
        .post('/api/prescriptions')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should reject prescription creation from non-doctor role', async () => {
      const response = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientName: 'John Doe',
          // Missing required fields
        });

      expect(response.status).toBe(422);
    });
  });

  describe('POST /api/prescriptions/verify - Verify Prescription', () => {
    beforeEach(async () => {
      // Create a prescription for verification tests
      const prescription = new Prescription({
        prescriptionNumber: Prescription.generatePrescriptionNumber(),
        patientName: 'John Doe',
        patientId: testPatientId,
        doctorName: 'Dr. Smith',
        doctorId: testDoctorId,
        medications: [
          {
            name: 'Paracetamol',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '7 days',
            quantity: 14,
          },
        ],
        issuedDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'active',
      });

      prescription.signature = prescription.generateSignature();
      prescription.qrCode = 'data:image/png;base64,test';
      await prescription.save();
      createdPrescription = prescription;
    });

    it('should verify a valid prescription in less than 1 second', async () => {
      const startTime = Date.now();
      const response = await request(app)
        .post('/api/prescriptions/verify')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          prescriptionNumber: createdPrescription.prescriptionNumber,
          signature: createdPrescription.signature,
        });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.verificationTime).toBeDefined();
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should reject prescription with invalid signature', async () => {
      const response = await request(app)
        .post('/api/prescriptions/verify')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          prescriptionNumber: createdPrescription.prescriptionNumber,
          signature: 'invalid_signature_12345',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    it('should reject non-existent prescription', async () => {
      const response = await request(app)
        .post('/api/prescriptions/verify')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          prescriptionNumber: 'RX-NOTFOUND-12345',
          signature: 'some_signature',
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject expired prescription', async () => {
      // Create an expired prescription
      const expiredPrescription = new Prescription({
        prescriptionNumber: Prescription.generatePrescriptionNumber(),
        patientName: 'John Doe',
        patientId: testPatientId,
        doctorName: 'Dr. Smith',
        doctorId: testDoctorId,
        medications: [{ name: 'Test', dosage: '100mg', frequency: 'Once', duration: '1 day', quantity: 1 }],
        issuedDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        expiryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Expired 30 days ago
        status: 'active',
      });

      expiredPrescription.signature = expiredPrescription.generateSignature();
      expiredPrescription.qrCode = 'data:image/png;base64,test';
      await expiredPrescription.save();

      const response = await request(app)
        .post('/api/prescriptions/verify')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          prescriptionNumber: expiredPrescription.prescriptionNumber,
          signature: expiredPrescription.signature,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    it('should log verification events to ActivityLog', async () => {
      await request(app)
        .post('/api/prescriptions/verify')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          prescriptionNumber: createdPrescription.prescriptionNumber,
          signature: createdPrescription.signature,
        });

      const logs = await ActivityLog.find({
        action: 'prescription_verify',
        resourceId: createdPrescription._id.toString(),
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].result).toBe('success');
    });
  });

  describe('GET /api/prescriptions/:prescriptionNumber', () => {
    beforeEach(async () => {
      const prescription = new Prescription({
        prescriptionNumber: Prescription.generatePrescriptionNumber(),
        patientName: 'John Doe',
        patientId: testPatientId,
        doctorName: 'Dr. Smith',
        doctorId: testDoctorId,
        medications: [
          {
            name: 'Paracetamol',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '7 days',
            quantity: 14,
          },
        ],
        issuedDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
      });

      prescription.signature = prescription.generateSignature();
      prescription.qrCode = 'data:image/png;base64,test';
      await prescription.save();
      createdPrescription = prescription;
    });

    it('should get prescription details', async () => {
      const response = await request(app)
        .get(`/api/prescriptions/${createdPrescription.prescriptionNumber}`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.prescription).toBeDefined();
      expect(response.body.data.prescription.prescriptionNumber).toBe(
        createdPrescription.prescriptionNumber
      );
    });

    it('should return 404 for non-existent prescription', async () => {
      const response = await request(app)
        .get('/api/prescriptions/RX-NOTFOUND-12345')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/prescriptions/:prescriptionNumber/reject', () => {
    beforeEach(async () => {
      const prescription = new Prescription({
        prescriptionNumber: Prescription.generatePrescriptionNumber(),
        patientName: 'John Doe',
        patientId: testPatientId,
        doctorName: 'Dr. Smith',
        doctorId: testDoctorId,
        medications: [
          {
            name: 'Paracetamol',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '7 days',
            quantity: 14,
          },
        ],
        issuedDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
      });

      prescription.signature = prescription.generateSignature();
      prescription.qrCode = 'data:image/png;base64,test';
      await prescription.save();
      createdPrescription = prescription;
    });

    it('should reject a prescription', async () => {
      const response = await request(app)
        .post(`/api/prescriptions/${createdPrescription.prescriptionNumber}/reject`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          reason: 'Medication not in stock',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.prescription.status).toBe('rejected');
      expect(response.body.data.prescription.rejectionReason).toBe('Medication not in stock');
    });

    it('should log rejection events', async () => {
      await request(app)
        .post(`/api/prescriptions/${createdPrescription.prescriptionNumber}/reject`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          reason: 'Test rejection',
        });

      const logs = await ActivityLog.find({
        action: 'prescription_reject',
        resourceId: createdPrescription._id.toString(),
      });

      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/prescriptions - List Prescriptions', () => {
    beforeEach(async () => {
      // Create multiple prescriptions
      for (let i = 0; i < 3; i++) {
        const prescription = new Prescription({
          prescriptionNumber: Prescription.generatePrescriptionNumber(),
          patientName: `Patient ${i}`,
          patientId: testPatientId,
          doctorName: 'Dr. Smith',
          doctorId: testDoctorId,
          medications: [
            {
              name: 'Test Med',
              dosage: '100mg',
              frequency: 'Once',
              duration: '1 day',
              quantity: 1,
            },
          ],
          issuedDate: new Date(),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'active',
        });

        prescription.signature = prescription.generateSignature();
        prescription.qrCode = 'data:image/png;base64,test';
        await prescription.save();
      }
    });

    it('should list prescriptions with pagination', async () => {
      const response = await request(app)
        .get('/api/prescriptions?page=1&limit=10')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.prescriptions).toBeDefined();
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('should filter prescriptions by status', async () => {
      const response = await request(app)
        .get('/api/prescriptions?status=active')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.prescriptions.every(p => p.status === 'active')).toBe(true);
    });
  });
});
