/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FaceSwapUI } from './components/FaceSwapUI';
import { Gallery } from './components/Gallery';
import { AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [showGallery, setShowGallery] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="w-full h-screen">
      <FaceSwapUI onOpenGallery={() => setShowGallery(true)} user={user} />
      <AnimatePresence>
        {showGallery && <Gallery onClose={() => setShowGallery(false)} user={user} />}
      </AnimatePresence>
    </div>
  );
}
