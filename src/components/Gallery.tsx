import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, MessageCircle, Share2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';

interface Post {
  id: string;
  imageUrl: string;
  authorId: string;
  authorName: string;
  likes: number;
  commentsCount: number;
  createdAt: any;
}

interface GalleryProps {
  onClose: () => void;
  user: User | null;
}

export const Gallery: React.FC<GalleryProps> = ({ onClose, user }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setPosts(postsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setUserLikes(new Set());
      return;
    }

    // This is a simplified way to track user likes. 
    // In a real app, you might want a more efficient way or fetch on demand.
    const unsubscribes: (() => void)[] = [];
    posts.forEach(post => {
      const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);
      const unsub = onSnapshot(likeRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserLikes(prev => new Set(prev).add(post.id));
        } else {
          setUserLikes(prev => {
            const next = new Set(prev);
            next.delete(post.id);
            return next;
          });
        }
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, posts.map(p => p.id).join(',')]);

  const handleLike = async (postId: string) => {
    if (!user) {
      alert("Please login to like posts");
      return;
    }

    const likeRef = doc(db, 'posts', postId, 'likes', user.uid);
    const postRef = doc(db, 'posts', postId);
    const isLiked = userLikes.has(postId);

    try {
      if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likes: increment(-1) });
      } else {
        await setDoc(likeRef, { userId: user.uid, postId, createdAt: new Date() });
        await updateDoc(postRef, { likes: increment(1) });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${postId}/likes`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="p-6 flex justify-between items-center border-b border-white/10">
        <h2 className="text-xl font-bold tracking-tight">Community Feed</h2>
        <button 
          onClick={onClose}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {posts.map((post) => (
            <motion.div 
              key={post.id}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden bg-white/5 border border-white/10"
              whileHover={{ scale: 1.02 }}
            >
              <img 
                src={post.imageUrl} 
                alt={`Post by ${post.authorName}`} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{post.authorName}</span>
                    <span className="text-[10px] opacity-60 uppercase tracking-widest">
                      {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className={cn(
                        "flex items-center gap-1 transition-colors",
                        userLikes.has(post.id) ? "text-pink-500" : "hover:text-pink-500"
                      )}
                    >
                      <Heart className={cn("w-5 h-5", userLikes.has(post.id) && "fill-current")} />
                      <span className="text-xs font-bold">{post.likes}</span>
                    </button>
                    <button className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                      <MessageCircle className="w-5 h-5" />
                      <span className="text-xs font-bold">{post.commentsCount}</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {posts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-40">
              <Share2 className="w-12 h-12 mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">No posts yet. Be the first!</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

