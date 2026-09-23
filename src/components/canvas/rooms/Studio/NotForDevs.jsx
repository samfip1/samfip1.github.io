import { useScene } from '../../../../context/SceneContext';
import './NotForDevs.scss';

// Studio room has no social media on purpose; say so, loudly.
const NotForDevs = () => {
    const { currentRoom } = useScene();
    if (currentRoom !== 'studio') return null;

    return (
        <div className="not-for-devs" aria-live="polite">
            <h2>It's not for devs, man!</h2>
            <p>It's not.</p>
        </div>
    );
};

export default NotForDevs;
