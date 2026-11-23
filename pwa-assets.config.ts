// Generates the PWA icons in public/ from public/icon.svg: npx pwa-assets-generator
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const green = { background: '#1f7a45' }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Maskable and Apple icons get padding; fill it with the brand green instead of white.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: green },
    apple: { ...minimal2023Preset.apple, resizeOptions: green },
  },
  images: ['public/icon.svg'],
})
