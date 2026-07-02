import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest's `test.globals` is off in this project (tests import explicitly from
// 'vitest'), so @testing-library/react can't auto-detect a test framework to
// hook its automatic unmount-after-each-test into. Without this, DOM from one
// test leaks into the next and queries like getByRole start matching
// duplicates across tests.
afterEach(() => {
  cleanup();
});
