import anonymizationService from '../services/anonymize.service.js';
import { BadRequestError } from '../utils/errors.js';

export const anonymizeData = async (req, res, next) => {
    try {
        const { data, config } = req.body;

        if (!data) {
            throw new BadRequestError('Data payload is required');
        }

        const options = {
            ...config,
            userId: req.user ? req.user._id : undefined // Audit logging
        };

        let result;
        if (Array.isArray(data)) {
            // Process array of records
            const processed = await Promise.all(data.map(item => anonymizationService.anonymizeRecord(item, options)));
            // Merge results
            const anonymizedData = processed.map(p => p.anonymized);
            // Merge mappings only if reversible
            let mapping = undefined;
            if (options.reversible) {
                mapping = processed.reduce((acc, curr) => ({ ...acc, ...curr.mapping }), {});
            }
            result = { anonymizedData, mapping };
        } else {
            // Process single record
            const { anonymized, mapping } = await anonymizationService.anonymizeRecord(data, options);
            result = { anonymizedData: anonymized, mapping };
        }

        res.status(200).json({
            success: true,
            data: result.anonymizedData,
            mapping: result.mapping
        });

    } catch (error) {
        next(error);
    }
};
