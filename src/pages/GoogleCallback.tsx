import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient, logger } from '@/shared';
import { GoogleLoginDto } from '@tainiex/shared-atlas';

const GoogleCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const code = searchParams.get('code');

        if (code) {
            const exchangeCode = async () => {
                try {
                    const payload: GoogleLoginDto = { code };
                    const res = await apiClient.post('/api/auth/google', payload);
                    if (res.ok) {
                        navigate('/app/chats');
                    } else {
                        navigate('/login');
                    }
                } catch (error) {
                    logger.error('Google exchange failed', error);
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
