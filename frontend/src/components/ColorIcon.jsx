import React from 'react';
import { Icon } from '@iconify/react';
import '../config/bundledIcons';

// Common system icon aliases mapped to high-quality colorful icons (100% pre-bundled offline)
const ICON_ALIASES = {
    // Fuels & Operations
    'fuel': 'fluent-emoji-flat:fuel-pump',
    'gas-station': 'fluent-emoji-flat:fuel-pump',
    'pump': 'fluent-emoji-flat:fuel-pump',
    'tanker': 'flat-color-icons:shipped',
    'truck': 'flat-color-icons:shipped',
    'delivery': 'flat-color-icons:shipped',

    // Finance & Sales
    'money': 'flat-color-icons:debt',
    'cash': 'flat-color-icons:money-transfer',
    'bank': 'fluent-emoji-flat:bank',
    'card': 'fluent-emoji-flat:credit-card',
    'check': 'flat-color-icons:ok',
    'invoice': 'flat-color-icons:data-sheet',
    'chart': 'fluent-color:data-pie-24',
    'trend-up': 'flat-color-icons:sales-performance',
    'calculator': 'flat-color-icons:calculator',

    // Administration & Security
    'user': 'fluent-color:person-24',
    'users': 'fluent-color:people-community-24',
    'settings': 'fluent-color:settings-24',
    'security': 'fluent-color:shield-24',
    'lock': 'flat-color-icons:privacy',
    'calendar': 'flat-color-icons:calendar',
    'bell': 'fluent-color:alert-24',
    'document': 'flat-color-icons:document',

    // Status & Feedback
    'success': 'flat-color-icons:ok',
    'warning': 'fluent-color:warning-24',
    'danger': 'fluent-emoji-flat:cross-mark',
    'info': 'fluent-emoji-flat:information',
    'sparkles': 'fluent-emoji-flat:sparkles'
};

/**
 * ColorIcon Component
 * Renders professional, colorful SVG icons from Iconify collections (Fluent Color, Flat Color Icons, etc.).
 *
 * @param {string} icon - Preset alias or exact Iconify icon ID (e.g. 'fuel', 'fluent-emoji-flat:fuel-pump', 'flat-color-icons:money-transfer')
 * @param {number|string} size - Icon dimension (width & height), defaults to 22
 * @param {string} className - Optional CSS classes
 * @param {object} style - Optional inline styles
 */
export default function ColorIcon({ icon, size = 22, className = '', style = {}, ...props }) {
    if (!icon) return null;

    const resolvedIcon = ICON_ALIASES[icon] || icon;

    return (
        <Icon
            icon={resolvedIcon}
            width={size}
            height={size}
            className={`color-icon ${className}`.trim()}
            style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                flexShrink: 0,
                ...style
            }}
            {...props}
        />
    );
}

// Export raw Icon component for direct custom usages if desired
export { Icon };

/**
 * Factory to create a React component compatible with standard icon props ({ size, className, style })
 */
export const createColorIcon = (iconId) => {
    const ColorIconWrapper = ({ size = 18, ...rest }) => <ColorIcon icon={iconId} size={size} {...rest} />;
    ColorIconWrapper.displayName = `ColorIcon(${iconId})`;
    return ColorIconWrapper;
};

