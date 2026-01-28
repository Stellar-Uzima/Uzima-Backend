const roles = {
  admin: [
    'create_record',
    'view_records',
    'manage_users',
    'view_users',
    'gdpr_export',
    'gdpr_delete',
    'gdpr_manage',
  ],
  doctor: ['create_record', 'view_records', 'gdpr_export', 'gdpr_delete'],
  patient: ['view_own_record', 'gdpr_export', 'gdpr_delete'],
  educator: ['view_own_record', 'gdpr_export', 'gdpr_delete'],
};

export default roles;
