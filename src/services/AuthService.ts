import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

export type AuthStateChangeCallback = (user: User | null) => void;

class AuthService {
    private currentUser: User | null = null;
    private listeners: AuthStateChangeCallback[] = [];

    constructor() {
        this.init();
    }

    private async init() {
        // Get initial session
        const { data: { session } } = await supabase.auth.getSession();
        this.currentUser = session?.user ?? null;
        this.notifyListeners();

        // Listen for changes
        supabase.auth.onAuthStateChange((_event: string, session: any) => {
            this.currentUser = session?.user ?? null;
            this.notifyListeners();
        });
    }

    onAuthStateChange(callback: AuthStateChangeCallback) {
        this.listeners.push(callback);
        // Trigger immediately with current state
        callback(this.currentUser);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.currentUser));
    }

    async login() {
        // Updated to Google as requested
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
                redirectTo: window.location.origin
            }
        });
        if (error) console.error('[AuthService] Login error:', error);
    }

    async logout() {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('[AuthService] Logout error:', error);
    }

    isLoggedIn() {
        return !!this.currentUser;
    }

    getUser() {
        return this.currentUser;
    }
}

export const authService = new AuthService();
