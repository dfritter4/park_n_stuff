import { describe, expect, it } from 'vitest';
import { buildCustomersQueryString } from './customers';

describe('buildCustomersQueryString', () => {
  it('includes only page and pageSize when no search is set', () => {
    const qs = buildCustomersQueryString({}, { page: 1, pageSize: 25 });
    expect(new URLSearchParams(qs)).toEqual(new URLSearchParams('page=1&pageSize=25'));
  });

  it('includes search when set', () => {
    const qs = buildCustomersQueryString({ search: 'Jane' }, { page: 2, pageSize: 25 });
    const params = new URLSearchParams(qs);
    expect(params.get('search')).toBe('Jane');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('25');
  });

  it('omits search entirely when it is an empty string', () => {
    const qs = buildCustomersQueryString({ search: '' }, { page: 1, pageSize: 25 });
    expect(new URLSearchParams(qs).has('search')).toBe(false);
  });
});
