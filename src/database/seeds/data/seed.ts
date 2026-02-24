import { DataSource } from 'typeorm';
import { TaskCategory } from '../../../tasks/entities/task-category.entity';

const categories = [
    {
        name: 'Nutrition',
        nameTranslations: {
            en: 'Nutrition',
            fr: 'Nutrition',
            sw: 'Lishe',
            ha: 'Abinci Mai Gina Jiki',
            yo: 'Ounjẹ',
            ig: 'Nri',
            am: 'አመጋገብ',
            ar: 'تغذية',
            pt: 'Nutrição',
            zu: 'Ukudla',
            xh: 'Ukutya',
            so: 'Nafaqo',
        },
        icon: 'nutrition',
        color: '#4CAF50',
    },
    {
        name: 'Exercise',
        nameTranslations: {
            en: 'Exercise',
            fr: 'Exercice',
            sw: 'Mazoezi',
            ha: 'Motsa Jiki',
            yo: 'Adaṣe',
            ig: 'Omume Ahụike',
            am: 'ልምምድ',
            ar: 'تمرين',
            pt: 'Exercício',
            zu: 'Ukuzilolonga',
            xh: 'Ukuzilolonga',
            so: 'Jimicsiga',
        },
        icon: 'exercise',
        color: '#2196F3',
    },
    {
        name: 'Mental Health',
        nameTranslations: {
            en: 'Mental Health',
            fr: 'Santé Mentale',
            sw: 'Afya ya Akili',
            ha: 'Lafiyar Hankali',
            yo: 'Ilera Ọpọlọ',
            ig: 'Ahụike Uche',
            am: 'የአዕምሮ ጤና',
            ar: 'الصحة النفسية',
            pt: 'Saúde Mental',
            zu: 'Impilo Yengqondo',
            xh: 'Impilo Yengqondo',
            so: 'Caafimaadka Maskaxda',
        },
        icon: 'mental-health',
        color: '#9C27B0',
    },
    {
        name: 'Maternal Health',
        nameTranslations: {
            en: 'Maternal Health',
            fr: 'Santé Maternelle',
            sw: 'Afya ya Uzazi',
            ha: 'Lafiyar Uwa',
            yo: 'Ilera Abiyamọ',
            ig: 'Ahụike Nne',
            am: 'የእናቶች ጤና',
            ar: 'صحة الأم',
            pt: 'Saúde Materna',
            zu: 'Impilo Yomama',
            xh: 'Impilo Yoomama',
            so: 'Caafimaadka Hooyadeed',
        },
        icon: 'maternal-health',
        color: '#E91E63',
    },
    {
        name: 'Preventive Care',
        nameTranslations: {
            en: 'Preventive Care',
            fr: 'Soins Préventifs',
            sw: 'Huduma za Kuzuia',
            ha: 'Kula da Rigakafi',
            yo: 'Itọju Idena',
            ig: 'Nlekọta Mgbochi',
            am: 'መከላከያ እንክብካቤ',
            ar: 'الرعاية الوقائية',
            pt: 'Cuidados Preventivos',
            zu: 'Ukunakekela Okuvinjelayo',
            xh: 'Unonophelo Lokukhusela',
            so: 'Daryeelka Kahortagga',
        },
        icon: 'preventive-care',
        color: '#FF9800',
    },
    {
        name: 'Hygiene',
        nameTranslations: {
            en: 'Hygiene',
            fr: 'Hygiène',
            sw: 'Usafi',
            ha: 'Tsabta',
            yo: 'Imọtótọ',
            ig: 'Ọcha',
            am: 'ንጽሕና',
            ar: 'النظافة',
            pt: 'Higiene',
            zu: 'Ubuhlanzekile',
            xh: 'Iimpilo',
            so: 'Nadaafadda',
        },
        icon: 'hygiene',
        color: '#00BCD4',
    },
    {
        name: 'Traditional Remedies',
        nameTranslations: {
            en: 'Traditional Remedies',
            fr: 'Remèdes Traditionnels',
            sw: 'Tiba za Jadi',
            ha: 'Magunguna na Gargajiya',
            yo: 'Atọgbẹ Ibile',
            ig: 'Ọgwụ Ọdịnala',
            am: 'ባህላዊ መድኃኒቶች',
            ar: 'العلاجات التقليدية',
            pt: 'Remédios Tradicionais',
            zu: 'Izifo Zemvelo',
            xh: 'Iindlela Zesikhokelo',
            so: 'Daawada Dhaqanka',
        },
        icon: 'traditional-remedies',
        color: '#795548',
    },
];

export async function seedTaskCategories(dataSource: DataSource): Promise<void> {
    const categoryRepository = dataSource.getRepository(TaskCategory);

    for (const categoryData of categories) {
        const existing = await categoryRepository.findOne({
            where: { name: categoryData.name },
        });

        if (!existing) {
            const category = categoryRepository.create(categoryData);
            await categoryRepository.save(category);
            console.log(`✅ Seeded category: ${categoryData.name}`);
        } else {
            console.log(`⏭️  Category already exists: ${categoryData.name}`);
        }
    }
}