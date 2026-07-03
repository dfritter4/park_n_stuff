import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { formatCentsAsDollars } from '../lib/format';
import type { CustomerFilters } from '../lib/customers';
import './customers.css';

const PAGE_SIZE = 25;

export function CustomersPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<CustomerFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const customersQuery = useCustomers(filters, { page, pageSize: PAGE_SIZE });

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setFilters({ search: searchInput.trim() || undefined });
    setPage(1);
  }

  const rows = customersQuery.data?.rows ?? [];
  const total = customersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="customers-page">
      <div className="customers-page-header">
        <h2>Customers</h2>
      </div>

      <form className="customers-search-bar" onSubmit={handleSearchSubmit}>
        <div className="form-field">
          <label htmlFor="customer-search">Search</label>
          <input
            id="customer-search"
            placeholder="Name, email, phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit">Search</button>
      </form>

      {customersQuery.isLoading && <p>Loading customers…</p>}
      {customersQuery.isError && <p role="alert">Could not load customers. Try again.</p>}

      {customersQuery.data && (
        <>
          <table className="reservations-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Reservations</th>
                <th>Lifetime spend</th>
                <th>Flagged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr
                  key={customer.id}
                  className="reservations-table-row"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  <td>{customer.name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.reservationCount}</td>
                  <td>{formatCentsAsDollars(customer.lifetimeSpendCents)}</td>
                  <td>
                    {customer.flagged ? (
                      <span className="status-badge status-badge-flagged">Flagged</span>
                    ) : (
                      <span aria-hidden="true">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && <p className="reservations-table-empty">No customers match this search.</p>}

          <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
