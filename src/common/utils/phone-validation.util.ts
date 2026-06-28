/**
 * Phone validation utilities
 */

export class PhoneValidationUtil {
  /**
   * Validates international phone number format
   * @param phoneNumber Phone number to validate
   * @returns True if valid, false otherwise
   */
  static isValidInternationalPhone(phoneNumber: string): boolean {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    // Remove any whitespace
    const cleanPhone = phoneNumber.trim();
    
    // Check if it starts with + and followed by 1-15 digits
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(cleanPhone);
  }

  /**
   * Normalizes phone number format
   * @param phoneNumber Phone number to normalize
   * @returns Normalized phone number or null if invalid
   */
  static normalizePhoneNumber(phoneNumber: string): string | null {
    if (!phoneNumber) {
      return null;
    }

    const cleanPhone = phoneNumber.trim();
    
    if (!this.isValidInternationalPhone(cleanPhone)) {
      return null;
    }

    return cleanPhone;
  }

  /**
   * Extracts country code from phone number
   * @param phoneNumber Phone number in international format
   * @returns Country code or null if invalid
   */
  static extractCountryCode(phoneNumber: string): string | null {
    if (!this.isValidInternationalPhone(phoneNumber)) {
      return null;
    }

    const cleanPhone = phoneNumber.trim();
    
    // Extract country code (everything after + until first space or first 2-3 digits)
    const match = cleanPhone.match(/^\+([1-9]\d{0,2})/);
    return match ? match[1] : null;
  }

  /**
   * Validates phone number for specific country
   * @param phoneNumber Phone number to validate
   * @param countryCode ISO country code (e.g., 'US', 'GB')
   * @returns True if valid for the country, false otherwise
   */
  static isValidPhoneForCountry(phoneNumber: string, countryCode: string): boolean {
    if (!this.isValidInternationalPhone(phoneNumber)) {
      return false;
    }

    const cleanPhone = phoneNumber.trim();
    const extractedCountryCode = this.extractCountryCode(cleanPhone);
    
    if (!extractedCountryCode) {
      return false;
    }

    // Basic country code validation
    const countryPatterns: { [key: string]: string } = {
      'US': '^1[2-9]\d{9}$',           // US: +1 followed by 10 digits
      'GB': '^44[1-9]\d{8,9}$',        // UK: +44 followed by 9-10 digits
      'CA': '^1[2-9]\d{9}$',           // Canada: +1 followed by 10 digits
      'AU': '^61[2-9]\d{8}$',          // Australia: +61 followed by 9 digits
      'DE': '^49[1-9]\d{8,11}$',       // Germany: +49 followed by 9-12 digits
      'FR': '^33[1-9]\d{8}$',          // France: +33 followed by 9 digits
      'IT': '^39[3-9]\d{8,10}$',       // Italy: +39 followed by 9-11 digits
      'ES': '^34[6-9]\d{8}$',          // Spain: +34 followed by 9 digits
      'NL': '^31[6-9]\d{8}$',          // Netherlands: +31 followed by 9 digits
      'BE': '^32[4-9]\d{7,8}$',        // Belgium: +32 followed by 8-9 digits
      'CH': '^41[7-9]\d{8}$',          // Switzerland: +41 followed by 9 digits
      'AT': '^43[6-9]\d{8,11}$',       // Austria: +43 followed by 9-12 digits
      'SE': '^46[7-9]\d{8}$',          // Sweden: +46 followed by 9 digits
      'NO': '^47[4-9]\d{7}$',          // Norway: +47 followed by 8 digits
      'DK': '^45[2-9]\d{7}$',          // Denmark: +45 followed by 8 digits
      'FI': '^358[4-9]\d{8}$',         // Finland: +358 followed by 9 digits
      'IE': '^353[8-9]\d{7,8}$',       // Ireland: +353 followed by 8-9 digits
      'PT': '^351[9][1236]\d{7}$',     // Portugal: +351 followed by 9 digits
      'GR': '^30[2-9]\d{9}$',          // Greece: +30 followed by 10 digits
      'TR': '^90[5]\d{9}$',            // Turkey: +90 followed by 10 digits
      'IL': '^972[5]\d{8}$',           // Israel: +972 followed by 9 digits
      'SA': '^966[5]\d{8}$',           // Saudi Arabia: +966 followed by 9 digits
      'AE': '^971[5]\d{8}$',           // UAE: +971 followed by 9 digits
      'IN': '^91[6-9]\d{9}$',          // India: +91 followed by 10 digits
      'PK': '^92[3]\d{9}$',            // Pakistan: +92 followed by 10 digits
      'BD': '^880[1-9]\d{9}$',         // Bangladesh: +880 followed by 10 digits
      'LK': '^94[7]\d{8}$',            // Sri Lanka: +94 followed by 9 digits
      'NP': '^977[9]\d{8}$',           // Nepal: +977 followed by 9 digits
      'TH': '^66[8-9]\d{8}$',          // Thailand: +66 followed by 9 digits
      'VN': '^84[3-9]\d{8}$',          // Vietnam: +84 followed by 9 digits
      'MY': '^60[1-9]\d{8,9}$',        // Malaysia: +60 followed by 9-10 digits
      'SG': '^65[6-9]\d{7}$',          // Singapore: +65 followed by 8 digits
      'PH': '^63[9]\d{9}$',            // Philippines: +63 followed by 10 digits
      'ID': '^62[8]\d{9,11}$',         // Indonesia: +62 followed by 10-12 digits
      'JP': '^81[7-9]\d{8}$',          // Japan: +81 followed by 9 digits
      'KR': '^82[1-9]\d{8,9}$',        // South Korea: +82 followed by 9-10 digits
      'CN': '^86[1-9]\d{10}$',         // China: +86 followed by 11 digits
      'HK': '^852[5-9]\d{7}$',         // Hong Kong: +852 followed by 8 digits
      'TW': '^886[9]\d{8}$',           // Taiwan: +886 followed by 9 digits
      'NZ': '^64[2-9]\d{7,9}$',        // New Zealand: +64 followed by 8-10 digits
      'ZA': '^27[6-8]\d{8}$',          // South Africa: +27 followed by 9 digits
      'EG': '^20[1-9]\d{9}$',          // Egypt: +20 followed by 10 digits
      'NG': '^234[7-9]\d{8}$',         // Nigeria: +234 followed by 10 digits
      'KE': '^254[7]\d{8}$',           // Kenya: +254 followed by 9 digits
      'GH': '^233[2-9]\d{8}$',         // Ghana: +233 followed by 9 digits
      'UG': '^256[3-9]\d{8}$',         // Uganda: +256 followed by 9 digits
      'TZ': '^255[6-7]\d{8}$',         // Tanzania: +255 followed by 9 digits
      'MX': '^52[1-9]\d{9}$',          // Mexico: +52 followed by 10 digits
      'BR': '^55[1-9]\d{9,10}$',       // Brazil: +55 followed by 10-11 digits
      'AR': '^54[9]\d{8}$',            // Argentina: +54 followed by 10 digits
      'CL': '^56[9]\d{8}$',            // Chile: +56 followed by 9 digits
      'CO': '^57[3]\d{9}$',            // Colombia: +57 followed by 10 digits
      'PE': '^51[9]\d{8}$',            // Peru: +51 followed by 9 digits
      'VE': '^58[4]\d{9}$',            // Venezuela: +58 followed by 10 digits
      'RU': '^7[9]\d{9}$',             // Russia: +7 followed by 10 digits
      'UA': '^380[3-9]\d{8}$',         // Ukraine: +380 followed by 9 digits
      'BY': '^375[2-9]\d{8}$',         // Belarus: +375 followed by 9 digits
      'KZ': '^7[6-7]\d{9}$',           // Kazakhstan: +7 followed by 10 digits
      'UZ': '^998[9]\d{8}$',           // Uzbekistan: +998 followed by 9 digits
      'AM': '^374[3-9]\d{7}$',         // Armenia: +374 followed by 8 digits
      'AZ': '^994[4-9]\d{8}$',         // Azerbaijan: +994 followed by 9 digits
      'GE': '^995[5-9]\d{8}$',         // Georgia: +995 followed by 9 digits
      'MD': '^373[6-9]\d{7}$',         // Moldova: +373 followed by 8 digits
      'RO': '^40[2-9]\d{8}$',          // Romania: +40 followed by 9 digits
      'BG': '^359[2-9]\d{7}$',         // Bulgaria: +359 followed by 8 digits
      'HR': '^385[9]\d{7}$',           // Croatia: +385 followed by 8 digits
      'RS': '^381[6-9]\d{7,8}$',       // Serbia: +381 followed by 8-9 digits
      'BA': '^387[6-9]\d{7}$',         // Bosnia: +387 followed by 8 digits
      'ME': '^382[6-9]\d{7}$',         // Montenegro: +382 followed by 8 digits
      'MK': '^389[7]\d{7}$',           // North Macedonia: +389 followed by 8 digits
      'AL': '^355[6-9]\d{7}$',         // Albania: +355 followed by 8 digits
      'XK': '^383[4-9]\d{7}$',         // Kosovo: +383 followed by 8 digits
    };

    // Remove the country code from the phone number for pattern matching
    const phoneNumberWithoutCountry = cleanPhone.substring(extractedCountryCode.length + 1);
    const pattern = countryPatterns[countryCode.toUpperCase()];
    
    if (!pattern) {
      // If no specific pattern for the country, use general validation
      return true;
    }

    const fullPattern = `^${extractedCountryCode}${pattern.substring(1)}`;
    return new RegExp(fullPattern).test(cleanPhone);
  }

  /**
   * Formats phone number for display
   * @param phoneNumber Phone number to format
   * @returns Formatted phone number
   */
  static formatPhoneNumber(phoneNumber: string): string {
    if (!this.isValidInternationalPhone(phoneNumber)) {
      return phoneNumber;
    }

    const cleanPhone = phoneNumber.trim();
    const countryCode = this.extractCountryCode(cleanPhone);
    const phoneNumberWithoutCountry = cleanPhone.substring(countryCode!.length + 1);

    // Basic formatting for common countries
    switch (countryCode) {
      case '1': // US/Canada
        if (phoneNumberWithoutCountry.length === 10) {
          return `+1 (${phoneNumberWithoutCountry.substring(0, 3)}) ${phoneNumberWithoutCountry.substring(3, 6)}-${phoneNumberWithoutCountry.substring(6)}`;
        }
        break;
      case '44': // UK
        if (phoneNumberWithoutCountry.length === 10) {
          return `+44 ${phoneNumberWithoutCountry.substring(0, 4)} ${phoneNumberWithoutCountry.substring(4)}`;
        }
        break;
      case '33': // France
        if (phoneNumberWithoutCountry.length === 9) {
          return `+33 ${phoneNumberWithoutCountry.substring(0, 2)} ${phoneNumberWithoutCountry.substring(2, 4)} ${phoneNumberWithoutCountry.substring(4, 6)} ${phoneNumberWithoutCountry.substring(6)}`;
        }
        break;
      case '49': // Germany
        if (phoneNumberWithoutCountry.length >= 9 && phoneNumberWithoutCountry.length <= 12) {
          return `+49 ${phoneNumberWithoutCountry.substring(0, 3)} ${phoneNumberWithoutCountry.substring(3)}`;
        }
        break;
    }

    // Return original if no specific formatting available
    return cleanPhone;
  }

  /**
   * Generates example phone numbers for testing
   * @param countryCode ISO country code
   * @returns Example phone number
   */
  static getExamplePhoneNumber(countryCode: string): string {
    const examples: { [key: string]: string } = {
      'US': '+12345678901',
      'GB': '+442071234567',
      'CA': '+14165551234',
      'AU': '+61212345678',
      'DE': '+493012345678',
      'FR': '+33123456789',
      'IT': '+393123456789',
      'ES': '+34612345678',
      'NL': '+31612345678',
      'BE': '+3212345678',
      'CH': '+4112345678',
      'AT': '+4312345678',
      'SE': '+4612345678',
      'NO': '+4712345678',
      'DK': '+4512345678',
      'FI': '+35812345678',
      'IE': '+35312345678',
      'PT': '+351912345678',
      'GR': '+302123456789',
      'TR': '+905123456789',
      'IL': '+972512345678',
      'SA': '+966512345678',
      'AE': '+971512345678',
      'IN': '+919123456789',
      'PK': '+923001234567',
      'BD': '+8801234567890',
      'LK': '+94712345678',
      'NP': '+977981234567',
      'TH': '+66812345678',
      'VN': '+84812345678',
      'MY': '+60123456789',
      'SG': '+6512345678',
      'PH': '+639123456789',
      'ID': '+628123456789',
      'JP': '+819012345678',
      'KR': '+821012345678',
      'CN': '+8612345678901',
      'HK': '+85212345678',
      'TW': '+886912345678',
      'NZ': '+6421234567',
      'ZA': '+27612345678',
      'EG': '+201234567890',
      'NG': '+2348012345678',
      'KE': '+254712345678',
      'GH': '+233201234567',
      'UG': '+256712345678',
      'TZ': '+255612345678',
      'MX': '+521234567890',
      'BR': '+55123456789',
      'AR': '+549112345678',
      'CL': '+56912345678',
      'CO': '+573123456789',
      'PE': '+51912345678',
      'VE': '+58412345678',
      'RU': '+7912345678',
      'UA': '+380501234567',
      'BY': '+375291234567',
      'KZ': '+77012345678',
      'UZ': '+998912345678',
      'AM': '+37491234567',
      'AZ': '+994501234567',
      'GE': '+995512345678',
      'MD': '+37361234567',
      'RO': '+40212345678',
      'BG': '+35921234567',
      'HR': '+38591234567',
      'RS': '+38161234567',
      'BA': '+38761234567',
      'ME': '+38261234567',
      'MK': '+38971234567',
      'AL': '+35561234567',
    };

    return examples[countryCode.toUpperCase()] || '+1234567890';
  }
}
