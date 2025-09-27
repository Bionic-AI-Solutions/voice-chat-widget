import React from 'react';
import { motion } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { LanguageOption } from '../types';
import { cn } from '../utils';

interface LanguageSelectorProps {
    languages: LanguageOption[];
    currentLanguage: string;
    onLanguageChange: (languageCode: string) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
    languages,
    currentLanguage,
    onLanguageChange,
}) => {
    return (
        <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                <Globe className="w-4 h-4" />
                <span>Select Language</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {languages.map((language) => (
                    <motion.button
                        key={language.code}
                        className={cn(
                            'flex items-center justify-between p-2 rounded-md border transition-all duration-200',
                            currentLanguage === language.code
                                ? 'bg-primary-50 border-primary-200 text-primary-700'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                        onClick={() => onLanguageChange(language.code)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className="flex items-center space-x-2">
                            <span className="text-lg">{language.flag}</span>
                            <div className="text-left">
                                <div className="text-sm font-medium">{language.name}</div>
                                <div className="text-xs text-gray-500">{language.nativeName}</div>
                            </div>
                        </div>

                        {currentLanguage === language.code && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-primary-600"
                            >
                                <Check className="w-4 h-4" />
                            </motion.div>
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};