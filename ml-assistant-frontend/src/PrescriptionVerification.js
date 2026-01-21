import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export default function PrescriptionVerification() {
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [signature, setSignature] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);
  const [prescriptionDetails, setPrescriptionDetails] = useState(null);

  const getAuthToken = () => {
    return window.localStorage.getItem('auth_token') || '';
  };

  // Listen for auth changes
  useEffect(() => {
    const handleAuthChange = () => {
      // Clear error if user just logged in
      if (getAuthToken()) {
        setError(null);
      }
    };
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  const handleQrScan = (qrData) => {
    try {
      const parsed = JSON.parse(qrData);
      setPrescriptionNumber(parsed.prescriptionNumber || '');
      setSignature(parsed.signature || '');
      setQrCodeData(qrData);
      setError(null);
    } catch (err) {
      setError('Invalid QR code format');
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    console.log('🔍 Verify button clicked!');
    console.log('Prescription Number:', prescriptionNumber);
    console.log('Signature:', signature ? signature.substring(0, 20) + '...' : 'empty');
    
    setLoading(true);
    setError(null);
    setVerificationResult(null);
    setPrescriptionDetails(null);

    try {
      const token = getAuthToken();
      console.log('Token:', token ? token.substring(0, 20) + '...' : 'NOT FOUND');
      
      if (!token) {
        setError('Authentication required. Please login first.');
        setLoading(false);
        return;
      }

      if (!prescriptionNumber || !signature) {
        setError('Please enter both prescription number and signature.');
        setLoading(false);
        return;
      }

      console.log('Making API call to:', `${API_BASE_URL}/prescriptions/verify`);
      const startTime = Date.now();
      const response = await fetch(`${API_BASE_URL}/prescriptions/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prescriptionNumber,
          signature,
        }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      const verificationTime = Date.now() - startTime;

      if (!response.ok) {
        setError(data.message || 'Verification failed');
        setVerificationResult({
          valid: false,
          message: data.message || 'Verification failed',
          verificationTime,
        });
      } else {
        setVerificationResult({
          valid: true,
          message: data.message || 'Prescription verified successfully',
          verificationTime: data.data?.verificationTime || verificationTime,
        });
        setPrescriptionDetails(data.data?.prescription);
      }
    } catch (err) {
      setError(err.message || 'Network error occurred');
      setVerificationResult({
        valid: false,
        message: err.message || 'Network error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!prescriptionNumber) {
      setError('Prescription number is required');
      return;
    }

    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/prescriptions/${prescriptionNumber}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ rejectionReason: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Rejection failed');
      } else {
        setVerificationResult({
          valid: false,
          message: 'Prescription rejected successfully',
          rejected: true,
        });
        setPrescriptionDetails(data.data?.prescription);
      }
    } catch (err) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    setQrCodeData('');
    setPrescriptionNumber('');
    setSignature('');
    setVerificationResult(null);
    setError(null);
    setPrescriptionDetails(null);
  };

  return (
    <div style={{
      maxWidth: 900,
      margin: '2rem auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      padding: '2rem',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', borderBottom: '2px solid #e9ecef', paddingBottom: '1rem' }}>
        <h2 style={{
          margin: 0,
          fontSize: '1.75rem',
          fontWeight: 600,
          color: '#212529',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1.5rem' }}>🔐</span>
          Prescription Verification System
        </h2>
        <p style={{
          margin: '0.5rem 0 0 0',
          color: '#6c757d',
          fontSize: '0.95rem',
        }}>
          Verify prescription authenticity using QR code scan or manual entry
        </p>
      </div>

      {/* QR Code Scanner Section */}
      <div style={{
        marginBottom: '2rem',
        padding: '1.5rem',
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
      }}>
        <h3 style={{
          margin: '0 0 0.75rem 0',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: '#495057',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>📷</span> QR Code Scanner
        </h3>
        <p style={{
          margin: '0 0 1rem 0',
          color: '#6c757d',
          fontSize: '0.9rem',
        }}>
          Use your device camera or QR scanner app to scan the prescription QR code, or paste the QR data below
        </p>
        <input
          type="text"
          placeholder="Paste QR code data here or scan with camera"
          value={qrCodeData}
          onChange={(e) => {
            setQrCodeData(e.target.value);
            if (e.target.value) {
              handleQrScan(e.target.value);
            }
          }}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: '0.75rem',
            border: '1px solid #ced4da',
            borderRadius: '6px',
            fontSize: '0.95rem',
            transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#007bff';
            e.target.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#ced4da';
            e.target.style.boxShadow = 'none';
          }}
        />
        <button
          onClick={handleManualEntry}
          style={{
            padding: '0.5rem 1rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'background-color 0.15s ease-in-out',
          }}
          onMouseOver={(e) => e.target.style.background = '#5a6268'}
          onMouseOut={(e) => e.target.style.background = '#6c757d'}
        >
          Clear & Manual Entry
        </button>
      </div>

      {/* Verification Form */}
      <form onSubmit={handleVerify} style={{ marginBottom: '2rem' }}>
        <div style={{
          padding: '1.5rem',
          background: '#ffffff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
        }}>
          <h3 style={{
            margin: '0 0 1.25rem 0',
            fontSize: '1.1rem',
            fontWeight: 600,
            color: '#495057',
          }}>
            Manual Verification
          </h3>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 600,
              color: '#495057',
              fontSize: '0.95rem',
            }}>
              Prescription Number <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="text"
              value={prescriptionNumber}
              onChange={(e) => setPrescriptionNumber(e.target.value)}
              required
              placeholder="RX-XXXXX-XXXXX"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontSize: '0.95rem',
                transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#007bff';
                e.target.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#ced4da';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 600,
              color: '#495057',
              fontSize: '0.95rem',
            }}>
              Cryptographic Signature <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              required
              placeholder="Enter cryptographic signature"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '6px',
                fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                fontSize: '0.85rem',
                transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#007bff';
                e.target.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#ced4da';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={loading || !prescriptionNumber || !signature}
              onClick={(e) => {
                e.preventDefault();
                if (!prescriptionNumber || !signature) {
                  setError('Please fill in both prescription number and signature.');
                  return;
                }
                handleVerify(e);
              }}
              style={{
                flex: '1',
                minWidth: '200px',
                padding: '0.875rem 1.75rem',
                background: (loading || !prescriptionNumber || !signature) ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (loading || !prescriptionNumber || !signature) ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
                transition: 'background-color 0.15s ease-in-out, transform 0.1s ease-in-out',
                boxShadow: (loading || !prescriptionNumber || !signature) ? 'none' : '0 2px 4px rgba(0, 123, 255, 0.3)',
              }}
              onMouseOver={(e) => {
                if (!loading && prescriptionNumber && signature) {
                  e.target.style.background = '#0056b3';
                  e.target.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading && prescriptionNumber && signature) {
                  e.target.style.background = '#007bff';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading ? (
                <span>⏳ Verifying...</span>
              ) : (
                <span>✓ Verify Prescription</span>
              )}
            </button>

            {prescriptionNumber && (
              <button
                type="button"
                onClick={handleReject}
                disabled={loading}
                style={{
                  padding: '0.875rem 1.75rem',
                  background: loading ? '#6c757d' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  transition: 'background-color 0.15s ease-in-out, transform 0.1s ease-in-out',
                  boxShadow: loading ? 'none' : '0 2px 4px rgba(220, 53, 69, 0.3)',
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.target.style.background = '#c82333';
                    e.target.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!loading) {
                    e.target.style.background = '#dc3545';
                    e.target.style.transform = 'translateY(0)';
                  }
                }}
              >
                ✗ Reject Prescription
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Verification Result */}
      {verificationResult && (
        <div
          style={{
            padding: '1.5rem',
            background: verificationResult.valid ? '#d4edda' : '#f8d7da',
            color: verificationResult.valid ? '#155724' : '#721c24',
            border: `2px solid ${verificationResult.valid ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}>
            <span style={{ fontSize: '1.5rem' }}>
              {verificationResult.valid ? '✅' : '❌'}
            </span>
            <strong style={{ fontSize: '1.25rem' }}>
              {verificationResult.valid ? 'Valid Prescription' : 'Invalid Prescription'}
            </strong>
          </div>
          <p style={{ margin: '0.5rem 0', fontSize: '1rem' }}>
            {verificationResult.message}
          </p>
          {verificationResult.verificationTime && (
            <p style={{
              margin: '0.75rem 0 0 0',
              fontSize: '0.9rem',
              color: verificationResult.valid ? '#0f5132' : '#842029',
              fontWeight: 500,
            }}>
              ⏱️ Verification completed in {verificationResult.verificationTime}ms
            </p>
          )}
        </div>
      )}

      {/* Prescription Details */}
      {prescriptionDetails && (
        <div
          style={{
            padding: '1.5rem',
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            marginTop: '1.5rem',
          }}
        >
          <h3 style={{
            margin: '0 0 1.25rem 0',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#212529',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '2px solid #dee2e6',
            paddingBottom: '0.75rem',
          }}>
            <span>📋</span> Prescription Details
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
          }}>
            <div>
              <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Patient
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500 }}>
                {prescriptionDetails.patientName}
              </p>
            </div>

            <div>
              <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Doctor
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500 }}>
                {prescriptionDetails.doctorName}
              </p>
            </div>

            <div>
              <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Prescription Number
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500, fontFamily: 'monospace' }}>
                {prescriptionDetails.prescriptionNumber}
              </p>
            </div>

            <div>
              <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Issued Date
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500 }}>
                {new Date(prescriptionDetails.issuedDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div>
              <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Expiry Date
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500 }}>
                {new Date(prescriptionDetails.expiryDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            {prescriptionDetails.verifiedAt && (
              <div>
                <strong style={{ color: '#6c757d', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Verified At
                </strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '1rem', color: '#212529', fontWeight: 500 }}>
                  {new Date(prescriptionDetails.verifiedAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}
          </div>

          {prescriptionDetails.medications && prescriptionDetails.medications.length > 0 && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #dee2e6' }}>
              <h4 style={{
                margin: '0 0 1rem 0',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#495057',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span>💊</span> Medications
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {prescriptionDetails.medications.map((med, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      background: '#ffffff',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: '#212529' }}>
                        {med.name}
                      </strong>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        background: '#e7f3ff',
                        color: '#0066cc',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}>
                        Qty: {med.quantity}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                      <div><strong>Dosage:</strong> {med.dosage}</div>
                      <div><strong>Frequency:</strong> {med.frequency}</div>
                      {med.duration && <div><strong>Duration:</strong> {med.duration}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prescriptionDetails.instructions && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #dee2e6' }}>
              <h4 style={{
                margin: '0 0 0.75rem 0',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#495057',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span>📝</span> Instructions
              </h4>
              <p style={{
                margin: 0,
                padding: '1rem',
                background: '#ffffff',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                color: '#495057',
                lineHeight: '1.6',
              }}>
                {prescriptionDetails.instructions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
