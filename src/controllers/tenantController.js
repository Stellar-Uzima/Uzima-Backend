import Tenant from '../models/Tenant.js';

export const getAllTenants = async (req, res) => {
    try {
        const tenants = await Tenant.find({ deletedAt: null });
        res.json(tenants);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createTenant = async (req, res) => {
    try {
        const { name, slug, settings } = req.body;
        const tenant = new Tenant({ name, slug, settings });
        await tenant.save();
        res.status(201).json(tenant);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getTenantById = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant || tenant.deletedAt) {
            return res.status(404).json({ message: 'Tenant not found' });
        }
        res.json(tenant);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }
        res.json(tenant);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteTenant = async (req, res) => {
    try {
        const tenant = await Tenant.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { new: true });
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }
        res.json({ message: 'Tenant deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
