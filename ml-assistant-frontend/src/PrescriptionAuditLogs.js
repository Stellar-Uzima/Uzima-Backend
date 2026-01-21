import React, { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export default function PrescriptionAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const getAuthToken = () => {
    return window.localStorage.getItem('auth_token') || '';
  };

  const getUserIdFromToken = () => {
    try {
      const token = getAuthToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id;
    } catch (e) {
      return null;
    }
  };

  const getUserRoleFromToken = () => {
    try {
      const token = getAuthToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role;
    } catch (e) {
      return null;
    }
  };

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        setError('Authentication required. Please login first.');
        setLoading(false);
        return;
      }

      const role = getUserRoleFromToken();
      const userId = getUserIdFromToken();
      
      // Use admin endpoint for admins, user endpoint for others
      let url;
      if (role === 'admin' || role === 'super_admin') {
        url = `${API_BASE_URL}/admin/activity?action=prescription_create,prescription_verify,prescription_reject,prescription_view&resourceType=prescription&limit=50&sortBy=timestamp&sortOrder=desc`;
      } else if (userId) {
        // Use user-specific endpoint for doctors and other roles
        url = `${API_BASE_URL}/activity/${userId}?action=prescription_create,prescription_verify,prescription_reject,prescription_view&resourceType=prescription&limit=50&sortBy=timestamp&sortOrder=desc`;
      } else {
        setError('Unable to determine user ID. Please login again.');
        setLoading(false);
        return;
      }

      console.log('Fetching audit logs from:', url);
      console.log('User ID:', userId, 'Role:', role);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Audit log API error:', response.status, data);
        console.error('Request URL:', url);
        throw new Error(data.message || `Failed to fetch audit logs (${response.status})`);
      }

      console.log('Audit log response:', data);
      const logData = data.data?.logs || [];
      console.log('Parsed logs:', logData.length, 'logs found');
      setLogs(logData);

      // Calculate statistics
      const verifications = logData.filter(l => l.action === 'prescription_verify');
      const successful = verifications.filter(v => v.result === 'success');
      const failed = verifications.filter(v => v.result === 'failure');
      
      const avgTime = successful.length > 0
        ? successful
            .filter(v => v.duration)
            .reduce((sum, v) => sum + (v.duration || 0), 0) / successful.filter(v => v.duration).length
        : 0;

      setStats({
        total: logData.length,
        created: logData.filter(l => l.action === 'prescription_create').length,
        verified: verifications.length,
        successful,
        failed,
        rejected: logData.filter(l => l.action === 'prescription_reject').length,
        avgVerificationTime: avgTime,
      });
    } catch (err) {
      const errorMsg = err.message || 'Failed to load audit logs';
      setError(errorMsg);
      console.error('Audit log fetch error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch logs on mount and when auth changes
  useEffect(() => {
    const handleAuthChange = () => {
      if (getAuthToken()) {
        fetchAuditLogs();
      }
    };
    
    // Fetch on mount if token exists
    if (getAuthToken()) {
      fetchAuditLogs();
    }
    
    // Listen for auth changes
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, [fetchAuditLogs]);

  return (
    <div style={{
      maxWidth: 1200,
      margin: '2rem auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '2rem',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', borderBottom: '2px solid #e9ecef', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.75rem',
              fontWeight: 600,
              color: '#212529',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span>📋</span> Prescription Audit Logs
            </h2>
            <p style={{
              margin: '0.5rem 0 0 0',
              color: '#6c757d',
              fontSize: '0.95rem',
            }}>
              Complete audit trail of all prescription verification events
            </p>
          </div>
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: loading ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <div style={{
            padding: '1rem',
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
          }}>
            <div style={{ color: '#6c757d', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Total Events</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#212529' }}>{stats.total}</div>
          </div>
          <div style={{
            padding: '1rem',
            background: '#e7f3ff',
            border: '1px solid #b3d9ff',
            borderRadius: '8px',
          }}>
            <div style={{ color: '#0066cc', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Created</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0066cc' }}>{stats.created}</div>
          </div>
          <div style={{
            padding: '1rem',
            background: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '8px',
          }}>
            <div style={{ color: '#155724', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Verified (Success)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#155724' }}>{stats.successful.length}</div>
          </div>
          <div style={{
            padding: '1rem',
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '8px',
          }}>
            <div style={{ color: '#721c24', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Failed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#721c24' }}>{stats.failed.length}</div>
          </div>
          {stats.avgVerificationTime > 0 && (
            <div style={{
              padding: '1rem',
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '8px',
            }}>
              <div style={{ color: '#856404', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Avg Verification Time</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#856404' }}>
                {stats.avgVerificationTime.toFixed(0)}ms
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{
          padding: '1rem 1.25rem',
          background: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '8px',
          marginBottom: '1.5rem',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Logs Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
          ⏳ Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: '#f8f9fa',
          borderRadius: '8px',
          color: '#6c757d',
        }}>
          📭 No audit logs found yet.
          <br />
          <span style={{ fontSize: '0.9rem' }}>
            Create and verify a prescription to see audit logs here.
          </span>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.9rem',
          }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Time</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Action</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>User</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Prescription</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Result</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Duration</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr
                  key={log._id || idx}
                  style={{
                    borderBottom: '1px solid #dee2e6',
                    background: idx % 2 === 0 ? '#ffffff' : '#f8f9fa',
                  }}
                >
                  <td style={{ padding: '0.75rem', color: '#495057' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      background: log.action === 'prescription_verify' ? '#e7f3ff' :
                                   log.action === 'prescription_create' ? '#d4edda' :
                                   log.action === 'prescription_reject' ? '#f8d7da' : '#f0f0f0',
                      color: log.action === 'prescription_verify' ? '#0066cc' :
                             log.action === 'prescription_create' ? '#155724' :
                             log.action === 'prescription_reject' ? '#721c24' : '#495057',
                    }}>
                      {log.action.replace('prescription_', '').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', color: '#495057' }}>
                    {log.userId?.username || log.userId?._id || 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#495057' }}>
                    {log.metadata?.prescriptionNumber || 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: log.result === 'success' ? '#d4edda' : '#f8d7da',
                      color: log.result === 'success' ? '#155724' : '#721c24',
                    }}>
                      {log.result === 'success' ? '✅ Success' : '❌ Failure'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', color: '#6c757d' }}>
                    {log.duration ? `${log.duration}ms` : 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#6c757d' }}>
                    {log.ipAddress || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
