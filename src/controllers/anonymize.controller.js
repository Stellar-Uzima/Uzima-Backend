import anonymizationService from '../services/anonymize.service.js';

export const anonymizeData = async (req, res) => {
  try {
    const { data, fieldsToAnonymize, reversible } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ message: 'Invalid data payload' });
    }

    const result = anonymizationService.anonymizeRecord(data, {
      fieldsToAnonymize,
      reversible,
    });

    res.status(200).json({
      success: true,
      anonymized: result.anonymized,
      ...(reversible && { mapping: result.mapping }),
    });
  } catch (error) {
    console.error('Anonymization Error:', error);
    res.status(500).json({ message: 'Server error during anonymization' });
  }
};
//
