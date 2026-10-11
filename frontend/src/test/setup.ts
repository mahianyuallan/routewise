import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library can't register its own cleanup:
// unmount after every test, or each test sees the DOM the previous ones rendered.
afterEach(cleanup)
