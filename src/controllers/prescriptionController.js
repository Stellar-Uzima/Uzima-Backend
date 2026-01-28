import Prescription from '../models/Prescription.js';
import ActivityLog from '../models/ActivityLog.js';
import ApiResponse from '../utils/apiResponse.js';
import QRCode from 'qrcode';

/**
 * Create a new prescription with QR code and cryptographic signature
 */
export const createPrescription = async (req, res) => {
  try {
    const {
      patientName,
      patientId,
      medications,
      instructions,
      expiryDays = 30, // Default 30 days expiry
    } = req.body;

    // Get doctor info from authenticated user
    const doctorId = req.user._id || req.user.id;
    const doctorName = req.user.username || req.user.email;

    // Generate prescription number
    const prescriptionNumber = Prescription.generatePrescriptionNumber();

    // Calculate expiry date
    const issuedDate = new Date();
    const expiryDate = new Date(issuedDate);
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    // Create prescription document
    const prescription = new Prescription({
      prescriptionNumber,
      patientName,
      patientId,
      doctorName,
      doctorId,
      medications,
      instructions,
      issuedDate,
      expiryDate,
      status: 'active',
    });

    // Generate cryptographic signature
    prescription.signature = prescription.generateSignature();

    // Generate QR code data (JSON string with prescription data and signature)
    const qrData = {
      prescriptionNumber: prescription.prescriptionNumber,
      signature: prescription.signature,
      issuedDate: prescription.issuedDate.toISOString(),
      expiryDate: prescription.expiryDate.toISOString(),
      patientName: prescription.patientName,
      doctorName: prescription.doctorName,
    };

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'H', // High error correction for reliability
      type: 'image/png',
      quality: 0.92,
      margin: 1,
    });

    prescription.qrCode = qrCodeDataURL;

    // Save prescription
    await prescription.save();

    // Log activity
    await ActivityLog.logActivity({
      userId: doctorId,
      action: 'prescription_create',
      resourceType: 'prescription',
      resourceId: prescription._id.toString(),
      metadata: {
        prescriptionNumber: prescription.prescriptionNumber,
        patientId: patientId.toString(),
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      result: 'success',
    });

    return ApiResponse.success(
      res,
      {
        prescription: {
          id: prescription._id,
          prescriptionNumber: prescription.prescriptionNumber,
          qrCode: prescription.qrCode,
          issuedDate: prescription.issuedDate,
          expiryDate: prescription.expiryDate,
          signature: prescription.signature,
        },
      },
      'Prescription created successfully',
      201
    );
  } catch (error) {
    console.error('Create prescription error:', error);
    return ApiResponse.error(res, error.message, 500);
  }
};

/**
 * Verify prescription signature and expiration
 */
export const verifyPrescription = async (req, res) => {
  const startTime = Date.now();
  try {
    const { prescriptionNumber, signature } = req.body;

    if (!prescriptionNumber || !signature) {
      return ApiResponse.error(res, 'Prescription number and signature are required', 400);
    }

    // Find prescription
    const prescription = await Prescription.findOne({ prescriptionNumber });

    if (!prescription) {
      // Log failed verification attempt
      await ActivityLog.logActivity({
        userId: req.user?._id || req.user?.id || null,
        action: 'prescription_verify',
        resourceType: 'prescription',
        resourceId: prescriptionNumber,
        metadata: {
          prescriptionNumber,
          reason: 'not_found',
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        result: 'failure',
        errorMessage: 'Prescription not found',
      });

      return ApiResponse.error(res, 'Prescription not found', 404);
    }

    // Check expiration
    if (prescription.isExpired()) {
      prescription.status = 'expired';
      prescription.verificationResult = 'expired';
      await prescription.save();

      await ActivityLog.logActivity({
        userId: req.user?._id || req.user?.id || null,
        action: 'prescription_verify',
        resourceType: 'prescription',
        resourceId: prescription._id.toString(),
        metadata: {
          prescriptionNumber,
          reason: 'expired',
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        result: 'failure',
        errorMessage: 'Prescription has expired',
      });

      return ApiResponse.error(res, 'Prescription has expired', 400);
    }

    // Verify signature
    const isValidSignature = prescription.verifySignature();
    const isSignatureMatch = prescription.signature === signature;

    if (!isValidSignature || !isSignatureMatch) {
      prescription.status = 'rejected';
      prescription.verificationResult = 'tampered';
      prescription.rejectionReason = 'Invalid or tampered signature';
      prescription.verifiedAt = new Date();
      prescription.verifiedBy = req.user?._id || req.user?.id || null;
      await prescription.save();

      await ActivityLog.logActivity({
        userId: req.user?._id || req.user?.id || null,
        action: 'prescription_verify',
        resourceType: 'prescription',
        resourceId: prescription._id.toString(),
        metadata: {
          prescriptionNumber,
          reason: 'invalid_signature',
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        result: 'failure',
        errorMessage: 'Invalid or tampered signature',
      });

      return ApiResponse.error(res, 'Invalid or tampered prescription signature', 400);
    }

    // Prescription is valid
    prescription.status = 'verified';
    prescription.verificationResult = 'valid';
    prescription.verifiedAt = new Date();
    prescription.verifiedBy = req.user?._id || req.user?.id || null;
    await prescription.save();

    const duration = Date.now() - startTime;

    // Get userId - ensure we have a valid ObjectId
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      console.error('Prescription verification: req.user is missing or has no _id/id');
    }

    // Log successful verification
    const logResult = await ActivityLog.logActivity({
      userId: userId,
      action: 'prescription_verify',
      resourceType: 'prescription',
      resourceId: prescription._id.toString(),
      metadata: {
        prescriptionNumber,
        reason: 'valid',
        verificationTime: duration,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      result: 'success',
      duration,
    });

    if (!logResult) {
      console.error('Failed to log prescription verification activity. UserId:', userId);
    }

    return ApiResponse.success(
      res,
      {
        valid: true,
        prescription: {
          id: prescription._id,
          prescriptionNumber: prescription.prescriptionNumber,
          patientName: prescription.patientName,
          doctorName: prescription.doctorName,
          medications: prescription.medications,
          instructions: prescription.instructions,
          issuedDate: prescription.issuedDate,
          expiryDate: prescription.expiryDate,
          verifiedAt: prescription.verifiedAt,
        },
        verificationTime: duration,
      },
      'Prescription verified successfully',
      200
    );
  } catch (error) {
    console.error('Verify prescription error:', error);
    return ApiResponse.error(res, error.message, 500);
  }
};

/**
 * Get prescription details by prescription number
 */
export const getPrescription = async (req, res) => {
  try {
    const { prescriptionNumber } = req.params;

    const prescription = await Prescription.findOne({ prescriptionNumber })
      .populate('patientId', 'username email')
      .populate('doctorId', 'username email')
      .populate('verifiedBy', 'username email');

    if (!prescription) {
      return ApiResponse.error(res, 'Prescription not found', 404);
    }

    return ApiResponse.success(res, { prescription }, 'Prescription retrieved successfully', 200);
  } catch (error) {
    console.error('Get prescription error:', error);
    return ApiResponse.error(res, error.message, 500);
  }
};

/**
 * Reject prescription (manual rejection by pharmacist)
 */
export const rejectPrescription = async (req, res) => {
  try {
    const { prescriptionNumber } = req.params;
    const { reason } = req.body;

    const prescription = await Prescription.findOne({ prescriptionNumber });

    if (!prescription) {
      return ApiResponse.error(res, 'Prescription not found', 404);
    }

    prescription.status = 'rejected';
    prescription.verificationResult = 'invalid';
    prescription.rejectionReason = reason || 'Rejected by pharmacist';
    prescription.verifiedAt = new Date();
    prescription.verifiedBy = req.user?._id || req.user?.id || null;
    await prescription.save();

    // Log rejection
    await ActivityLog.logActivity({
      userId: req.user?._id || req.user?.id || null,
      action: 'prescription_reject',
      resourceType: 'prescription',
      resourceId: prescription._id.toString(),
      metadata: {
        prescriptionNumber,
        reason: reason || 'Rejected by pharmacist',
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      result: 'success',
    });

    return ApiResponse.success(res, { prescription }, 'Prescription rejected successfully', 200);
  } catch (error) {
    console.error('Reject prescription error:', error);
    return ApiResponse.error(res, error.message, 500);
  }
};

/**
 * Get all prescriptions (with filters)
 */
export const getPrescriptions = async (req, res) => {
  try {
    const { status, patientId, doctorId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (patientId) query.patientId = patientId;
    if (doctorId) query.doctorId = doctorId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const prescriptions = await Prescription.find(query)
      .populate('patientId', 'username email')
      .populate('doctorId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Prescription.countDocuments(query);

    return ApiResponse.success(
      res,
      {
        prescriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
      'Prescriptions retrieved successfully',
      200
    );
  } catch (error) {
    console.error('Get prescriptions error:', error);
    return ApiResponse.error(res, error.message, 500);
  }
};
