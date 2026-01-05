
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';

const GoogleCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const code = searchParams.get('code');

        if (code) {
            const exchangeCode = async () => {
                try {
                    const res = await apiClient.post('/api/auth/google', { code });
                    if (res.ok) {
                        navigate('/app');
                    } else {
                        navigate('/login');
                    }
                } catch (error) {
                    console.error('Google exchange failed', error);
                    navigate('/login');
                }
            };
            exchangeCode();
        } else {
            navigate('/login');
        }
    }, [searchParams, navigate]);

    return (
        <div className="container" style={{ paddingTop: '100px', textAlign: 'center' }}>
            <h2>Processing Login...</h2>
        </div>
    );
};

export default GoogleCallback;
