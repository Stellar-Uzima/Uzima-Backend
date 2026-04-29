/**
 * List of all 54 African countries with ISO codes and flag emojis
 * Used for frontend country selection dropdowns
 */

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const AFRICAN_COUNTRIES: Country[] = [
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
  { code: 'CV', name: 'Cape Verde', flag: '🇨🇻' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩' },
  { code: 'KM', name: 'Comoros', flag: '🇰🇲' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'CD', name: 'Democratic Republic of the Congo', flag: '🇨🇩' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'ST', name: 'São Tomé and Príncipe', flag: '🇸🇹' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'SS', name: 'South Sudan', flag: '🇸🇸' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼' },
];
