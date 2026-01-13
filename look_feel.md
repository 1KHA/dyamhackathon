# Admin Dashboard Design System

This document outlines the design system used for the Admin Hackathon Dashboard, focusing on the modernized Mentors page. It serves as a reference for maintaining design consistency across the application.

## Color Palette

### Primary Colors
- **Orange**: 
  - Primary: `#FF8D30` (orange-500)
  - Light: `#FFEAD9` (orange-50)
  - Medium: `#FFBC85` (orange-200)
  - Dark: `#E67A1F` (orange-800)
  - Used for: Primary buttons, call-to-action elements, highlights, and important actions

- **Dark Blue**:
  - Primary: `#183063` (blue-900)
  - Light: `#E6EBF4` (blue-50)
  - Medium: `#8A9CC0` (blue-300)
  - Dark: `#0F1D3D` (blue-950)
  - Used for: Headers, text, navigation elements, and backgrounds

### Secondary Colors
- **Gray**:
  - Primary: `#525661` (gray-600)
  - Light: `#F5F6F7` (gray-50)
  - Medium: `#A9ACB3` (gray-300)
  - Dark: `#383B44` (gray-800)
  - Used for: Neutral elements, borders, secondary text, and disabled states

- **Green**:
  - Primary: `#06AC4B` (green-600)
  - Light: `#E6F7ED` (green-50)
  - Medium: `#7DD9A1` (green-300)
  - Dark: `#048A3C` (green-700)
  - Used for: Success states, active status, positive metrics, and environmental themes

### Accent Colors
- **Red**:
  - Primary: `#EF4444` (red-500)
  - Light: `#FEE2E2` (red-100)
  - Dark: `#991B1B` (red-800)
  - Used for: Error states, destructive actions, unavailable status

- **Yellow**:
  - Primary: `#F59E0B` (yellow-500)
  - Light: `#FEF3C7` (yellow-100)
  - Dark: `#B45309` (yellow-800)
  - Used for: Warnings, pending status, ratings

## Typography

### Font Family
- Primary font: System font stack (Tailwind's default sans-serif)
- Arabic text is properly supported with RTL direction

### Font Sizes
- Page Title: `text-3xl` (1.875rem)
- Card Titles: `text-sm` (0.875rem)
- Card Values: `text-3xl` (1.875rem)
- Table Headers: Default size with medium font weight
- Table Content: Default size
- Secondary Information: `text-xs` (0.75rem)

### Font Weights
- Bold: `font-bold` for important numbers and headings
- Medium: `font-medium` for card titles and emphasized text
- Regular: Default weight for most text content

## Component Styling

### Cards
- **Stat Cards**:
  - No borders: `border-0`
  - Subtle shadow: `shadow-sm`
  - Hover effect: `hover:shadow-md transition-shadow duration-200`
  - Gradient backgrounds: `bg-gradient-to-br from-white to-[color]-50`
  - Compact padding: Header `pb-2`, standard padding for content
  - Icons in card titles: `h-5 w-5` with corresponding color

### Buttons
- **Primary Action Button**:
  - Orange background: `bg-orange-500` (#FF8D30)
  - Hover state: `hover:bg-orange-600`
  - Rounded corners: `rounded-full`
  - Icon + text layout with gap: `flex items-center gap-1`

- **Secondary/Outline Button**:
  - Transparent background with colored border: `border-gray-300`
  - Colored text: `text-gray-600` (#525661)
  - Hover state: `hover:bg-gray-50`
  - Rounded corners: `rounded-full`
  - Icon + text layout with gap: `flex items-center gap-1`

- **Success Button**:
  - Green background: `bg-green-600` (#06AC4B)
  - Hover state: `hover:bg-green-700`
  - Rounded corners: `rounded-full`
  - Icon + text layout with gap: `flex items-center gap-1`

- **Icon Buttons**:
  - Ghost variant for subtle actions: `variant="ghost"`
  - Compact size: `h-8 w-8 p-0`

### Tables
- **Table Header**:
  - Light orange background: `bg-orange-50`
  - Consistent hover state: `hover:bg-orange-50`

- **Table Rows**:
  - Hover effect: `hover:bg-gray-50 transition-colors duration-150`
  - Clean borders between rows

- **Table Cells**:
  - Primary content with secondary information below
  - Icons paired with text: `flex items-center gap-2`
  - Right-aligned action buttons: `justify-end`

### Inputs and Filters
- **Search Input**:
  - Rounded full: `rounded-full`
  - Icon positioning: Absolute positioning with transform
  - Border color: `border-orange-100`
  - Focus state: `focus:border-orange-300`
  - Right padding for icon: `pr-10`

- **Select Dropdowns**:
  - Rounded full: `rounded-full`
  - Border color: `border-gray-200`
  - Focus state: `focus:border-orange-300`
  - Appropriate width based on content

### Badges
- **Status Badges**:
  - Color-coded by status:
    - Active: Green (`bg-green-100 text-green-700`) (#06AC4B)
    - Pending: Orange (`bg-orange-100 text-orange-700`) (#FF8D30)
    - Inactive: Gray (`bg-gray-100 text-gray-700`) (#525661)
    - Warning: Yellow (`bg-yellow-100 text-yellow-700`)
    - Error: Red (`bg-red-100 text-red-700`)
  - Compact and rounded by default

### Dialogs
- **Modal Dialogs**:
  - No borders: `border-0`
  - Enhanced shadow: `shadow-lg`
  - Rounded corners: `rounded-lg`
  - Clean, white background
  - Structured header, content, and footer sections
  - Appropriate max-width based on content type

## Visual Effects

### Shadows
- **Card Shadows**:
  - Default: `shadow-sm`
  - Hover: `hover:shadow-md`
  - Transition: `transition-shadow duration-200`

- **Dialog Shadows**:
  - Enhanced: `shadow-lg`

### Gradients
- **Card Backgrounds**:
  - Direction: `bg-gradient-to-br`
  - Colors: `from-white to-[color]-50`
  - Subtle effect that enhances visual hierarchy

### Hover Effects
- **Cards**: Shadow enhancement on hover
- **Buttons**: Background color change on hover
- **Table Rows**: Background color change on hover

### Transitions
- Shadow transitions: `transition-shadow duration-200`
- Color transitions: `transition-colors duration-150`

## Layout and Spacing

### Grid System
- **Stat Cards**: `grid grid-cols-1 md:grid-cols-4 gap-4`
- **Form Layouts**: `grid grid-cols-4 items-center gap-4`

### Margins and Padding
- Page container: `p-8`
- Section spacing: `mb-8`
- Card content: Standard padding with `pt-6` for top-heavy content
- Form fields: `gap-4` between items

### Alignment
- **RTL Support**: `dir="rtl"` for Arabic text direction
- Vertical alignment: `items-center`
- Horizontal spacing: `gap-2` or `gap-4` depending on context
- Action buttons: Right-aligned with `justify-end`

## Responsive Design

### Breakpoints
- Mobile-first approach with responsive adjustments at:
  - `md`: Medium screens (768px and above)

### Responsive Patterns
- **Filter Layout**:
  - Mobile: `flex-col`
  - Desktop: `md:flex-row`

- **Card Grid**:
  - Mobile: Single column
  - Desktop: Four columns

## RTL Support Considerations

- Page container has `dir="rtl"` attribute
- Text alignment follows RTL conventions
- Icon placement adjusted for RTL (icons appear on the right side of text)
- Form labels positioned on the right side
- Calendar component configured with `rtl={true}`
- Arabic localization for dates and calendar navigation

## Accessibility

### Color Contrast
- Text colors maintain appropriate contrast with backgrounds
- Status indicators use both color and text for clarity

### Interactive Elements
- Buttons and interactive elements have appropriate hover/focus states
- Icons include `sr-only` text for screen readers where needed

## Calendar Component Styling

- Full-height container: `height: '70vh'`
- White background with padding: `backgroundColor: 'white', padding: '20px'`
- Rounded corners: `borderRadius: '8px'`
- Arabic localization for all calendar text
- RTL support enabled

---

This design system should be applied consistently across all admin dashboard pages to maintain a cohesive user experience.
