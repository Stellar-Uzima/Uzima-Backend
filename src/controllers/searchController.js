import Patient from "../models/patient.model.js";
import MedicalRecord from "../models/medicalRecord.model.js";

export const search = async (req, res) => {
  try {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query (q) is required" });
    }

    // Run both searches in parallel
    const [patients, records] = await Promise.all([
      Patient.find({ $text: { $search: query } })
        .skip(skip)
        .limit(limit)
        .exec(),
      MedicalRecord.find({ $text: { $search: query } })
        .populate("patientId", "firstName lastName email")
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    res.json({
      page,
      limit,
      results: {
        patients,
        records,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error performing search", error: err.message });
  }
};
