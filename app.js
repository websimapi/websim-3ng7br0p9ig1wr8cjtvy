import * as THREE from "three";
import { PlayerControls } from "./controls.js";
import { createPlayerModel } from "./player.js";
import { createBattleRoyaleMap } from "./worldGeneration.js";
import { Gun } from "./gun.js";
import { checkTipsAndApplyRank } from "./tipHelpers.js";

// Admin ranks for commands
const ADMIN_RANKS = ['Admin', 'Owner', 'Dev', 'SrDev', 'SrMod', 'Moderator'];

/* @tweakable The exact length required for a player tag name. */
const TAG_NAME_LENGTH = 8;

/* @tweakable The minimum allowed characters for a player tag name. */
const TAG_NAME_MIN = 2;

/* @tweakable The maximum allowed characters for a player tag name. */
const TAG_NAME_MAX = 8;

/* @tweakable The username to be made a developer */
const newDevUsername = "craftyyy";

/* @tweakable The username to be made a Senior Moderator */
const newSrModUsername = "NexusKing";

/* @tweakable temporary admin password for /adminpassword */
const ADMIN_PASSWORD = "letmein";

/* @tweakable default shutdown banner background color */
const SHUTDOWN_BANNER_BG = "rgba(220, 38, 38, 0.92)";

/* @tweakable macro definitions (name -> list of actions) */
const MACROS = {
  restart_map: [
    { type: "announce", message: "Restarting map...", color: "#ffd700" },
    { type: "clear_npcs" },
    { type: "clear_timers" },
    { type: "heal_all", amount: 100 }
  ]
};

/* @tweakable Skill definitions for each rank. Cooldowns are in seconds. */
const SKILL_DEFINITIONS = {
    'Lapis': {
        id: 'lapis_heal',
        name: 'Heal',
        cooldown: 120,
        effects: [
            { type: 'heal', duration: 5, amountPerSecond: 10 }
        ]
    },
    'Gold': {
        id: 'gold_speed',
        name: 'Speed Run',
        cooldown: 180,
        effects: [
            { type: 'speed', duration: 5, multiplier: 2.0 }
        ]
    },
    'Diamond': {
        id: 'diamond_skill',
        name: 'Flight & Heal',
        cooldown: 300,
        effects: [
            { type: 'fly', duration: 15 },
            { type: 'heal', duration: 10, amountPerSecond: 10 }
        ]
    },
    'Emerald': {
        id: 'emerald_skill',
        name: 'Power Up',
        cooldown: 150,
        effects: [
            { type: 'fly', duration: 30 },
            { type: 'heal', duration: 15, amountPerSecond: 10 },
            { type: 'speed', duration: 20, multiplier: 1.5 }
        ]
    },
    'Netherite': {
        id: 'netherite_skill',
        name: 'Shadow Form',
        cooldown: 300,
        effects: [
            { type: 'invisible', duration: 15 },
            { type: 'heal', duration: 30, amountPerSecond: 10 },
            { type: 'fly', duration: 30 },
            { type: 'speed', duration: 40, multiplier: 1.8 }
        ]
    },
    'Amethyst': {
        id: 'amethyst_skill',
        name: 'Overdrive',
        cooldown: 300,
        effects: [
            { type: 'invisible', duration: 40 },
            { type: 'heal', duration: 40, amountPerSecond: 15 },
            { type: 'fly', duration: 40 },
            { type: 'speed', duration: 40, multiplier: 2.5 }
        ]
    }
};

/* @tweakable The message displayed for the Flicker Night game */
const FLICKER_NIGHT_MESSAGE = "sorry game is still under process try later [Developed by @Nexusking aka @bluelxgend dc : Itz_europa , updates and idea by @Itx_Meow creator and owner]";
/* @tweakable The duration of the flicker animation in seconds. */
const flickerAnimationDuration = 0.5;
/* @tweakable The color of the glitch effect text shadow. */
const glitchTextColor = "red";
/* @tweakable The duration for typing out the horror message in seconds. */
const typingDuration = 4;

/* @tweakable Intro display duration in milliseconds (default 4000ms) */
const INTRO_DURATION_MS = 4000;

/* @tweakable Whether to show the intro overlay on load (true/false) */
const INTRO_ENABLED = true;

// Simple seeded random number generator
class MathRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  random() {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
}

// Helper to format millisecond duration to a readable string
function formatDuration(ms) {
    if (ms < 0) ms = 0;
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    
    seconds = seconds % 60;
    minutes = minutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds >= 0 && parts.length < 2) parts.push(`${seconds}s`);
    
    return parts.join(' ') || '0s';
}

// Helper function to parse Minecraft style codes (§) into HTML
function parseMinecraftCodes(text) {
    const codeMap = {
        '5': 'mc-purple',
        'l': 'mc-bold',
        'r': 'mc-reset'
    };

    let html = '<span class="minecraft-text">';
    const parts = text.split('§');
    html += parts[0];

    for (let i = 1; i < parts.length; i++) {
        const code = parts[i][0];
        const rest = parts[i].substring(1);
        
        if (code === 'r') {
            html += `</span><span class="minecraft-text mc-reset">${rest}`;
        } else if (codeMap[code]) {
            html += `<span class="${codeMap[code]}">${rest}</span>`;
        } else {
            // If code unknown, reinsert literal '§' plus the chunk so that lone § characters are preserved
            html += `§${parts[i]}`;
        }
    }
    html += '</span>';

    // Replace any remaining literal '§' characters with a styled glitch symbol.
    // These are literal user-typed § characters that weren't part of a recognized code.
    html = html.replace(/§/g, `<span class="glitch-symbol">§</span>`);

    return html;
}

// Initialize room variable globally
let room = null;
let playerControls = null;

// Persistent announcement banner
let announcementBannerEl = null;
function ensureAnnouncementBanner() {
  if (!announcementBannerEl) {
    announcementBannerEl = document.getElementById('announcement-banner');
  }
  return announcementBannerEl;
}
function setAnnouncement(message, color) {
  const el = ensureAnnouncementBanner();
  if (!el) return;
  if (message && message.trim()) {
    el.textContent = message;
    el.style.backgroundColor = color || 'rgba(0,0,0,0.85)';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// Add a persistent shutdown overlay
let shutdownBannerEl = null;
let shutdownInterval = null;

function ensureShutdownBanner() {
  if (!shutdownBannerEl) {
    shutdownBannerEl = document.getElementById('shutdown-banner');
  }
  return shutdownBannerEl;
}

// Function to check admin privileges, including temporary admin status
function isAdmin(playerPresence) {
  const rank = playerPresence?.rank || 'default';
  return ADMIN_RANKS.includes(rank) || playerPresence?.isTempAdmin === true;
}

// Add shop functionality to main menu
// Add shop button to main menu
function addShopButton() {
  const shopButton = document.createElement('button');
  shopButton.id = 'shop-button';
  shopButton.textContent = 'SHOP';
  document.body.appendChild(shopButton);
  
  shopButton.addEventListener('click', () => {
    openShop();
  });
}

// Add gems to shop data
const shopRanks = [
  { 
    name: 'Lapis', 
    price: 250, 
    gemPrice: 0, 
    color: '#1e3a8a', 
    icon: 'lapis', 
    useImage: true, 
    description: 'Basic rank with chat colors' 
  },
  { name: 'Gold', price: 500, gemPrice: 250, color: '#f59e0b', icon: 'gold', description: 'Gold perks and emotes', useImage: true },
  { name: 'Diamond', price: 1000, gemPrice: 500, color: '#0ea5e9', icon: 'diamond', description: 'Diamond tools and effects', useImage: true },
  { name: 'Emerald', price: 2500, gemPrice: 1250, color: '#10b981', icon: '💚', description: 'Emerald trails and particles' },
  { name: 'Netherite', price: 5000, gemPrice: 2500, color: '#374151', icon: '⚫', description: 'Ultimate rank with all perks' },
  { name: 'Amethyst', price: 7500, gemPrice: 3750, color: '#ec4899', icon: '💜', description: 'Exclusive amethyst effects' },
  { name: 'Bedrock', price: 10000, gemPrice: 5000, color: '#111827', icon: '⬛', description: 'Legendary bedrock status' }
];

/* @tweakable The secret code to unlock the Mythic rank. */
const MYTHIC_SECRET_CODE = 'immythicalplayer';
/* @tweakable Auto-equip Mythic rank immediately when unlocked (true/false) */
const AUTO_EQUIP_MYTHIC = true;
/* @tweakable The color used for the full-name Mythic glow (CSS color string) */
const MYTHIC_GLOW_COLOR = '#AA00AA';
/* @tweakable The blur radius for the Mythic glow (px) */
const MYTHIC_GLOW_BLUR = 8;
/* @tweakable The spread/intensity multiplier for the Mythic glow (number) */
const MYTHIC_GLOW_SPREAD = 1.4;

/* @tweakable Duration (s) for Mythic red↔blue animation */
const MYTHIC_RB_ANIM_DURATION = 5;

/* @tweakable Mythic red color (hex) */
const MYTHIC_RB_RED = '#FF5555';

/* @tweakable Mythic blue color (hex) */
const MYTHIC_RB_BLUE = '#5555FF';

/* @tweakable Mythic glow blur size (px) */
const MYTHIC_RB_GLOW_SIZE = '10px';

// Update staffRanks array to include SrDev rank with developer icon
const staffRanks = [
  { name: 'Sponsor', price: 0, gemPrice: 0, color: '#87CEEB', icon: 'sponsor', description: 'Exclusive sponsor rank', secretCode: 'sponsoringxd' },
  { name: 'YouTube', price: 0, gemPrice: 0, color: '#FF0000', icon: 'youtube', description: 'Official YouTube creator', secretCode: 'youtuberxd' },
  { name: 'Twitch', price: 0, gemPrice: 0, color: '#9146FF', icon: 'twitch', description: 'Twitch streaming partner', secretCode: 'twitchxd' },
  { name: 'Media', price: 0, gemPrice: 0, color: '#FFD700', icon: 'media', description: 'Media partner rank', secretCode: 'mediaxd', useImage: true },
  { name: 'Content', price: 0, gemPrice: 0, color: '#FFD700', icon: 'content', description: 'Content creator rank', secretCode: 'contentxd' },
  { name: 'Support', price: 0, gemPrice: 0, color: '#800080', icon: 'support', description: 'Support team member', secretCode: 'supportering', useImage: true },
  { name: 'TrialMod', price: 0, gemPrice: 0, color: '#8B00FF', icon: 'trialmod', description: 'Trial moderator', secretCode: 'imtrialmod', useImage: true },
  { name: 'Moderator', price: 0, gemPrice: 0, color: '#800080', icon: 'moderator', description: 'Full moderator', secretCode: 'immod01', useImage: true },
  { name: 'SrMod', price: 0, gemPrice: 0, color: '#8B0000', icon: 'srmod', description: 'Senior moderator', secretCode: 'imsrmod', useImage: true },
  { name: 'Coder', price: 0, gemPrice: 0, color: '#0000FF', icon: 'coder', description: 'Code contributor', secretCode: 'imcoder', useImage: true },
  { name: 'Admin', price: 0, gemPrice: 0, color: '#FFA500', icon: 'admin', description: 'Administrator', secretCode: 'adminnn', useImage: true },
  { name: 'Dev', price: 0, gemPrice: 0, color: '#00FFFF', icon: 'dev', description: 'Developer', secretCode: 'imdev01', useImage: true },
  { name: 'SrDev', price: 0, gemPrice: 0, color: '#00008B', icon: 'srdev', description: 'Senior developer', secretCode: 'imsrdev', useImage: true },
  { name: 'Owner', price: 0, gemPrice: 0, color: '#FF0000', icon: 'owner', description: 'Server owner', secretCode: 'mdsmbbdpki10', useImage: true },
  /* @tweakable The definition for the Mythic rank. */
  { name: 'Mythic', price: 0, gemPrice: 0, color: '#AA00AA', icon: 'mythic', description: 'Legendary rank unlocked via secret code.', secretCode: MYTHIC_SECRET_CODE, format: '[§5§lMythic§r|§r{username}]' }
];

/* @tweakable The initial list of staff members. This list is only used if no list is set in the room state. */
const INITIAL_STAFF_LIST = [
    { rank: 'Owner', name: 'Itx_Meow', color: 'red' },
    { rank: 'SrDev', name: 'Blacklxgend', color: 'darkblue' },
    { rank: 'Dev', name: 'Craftyyy', color: 'cyan' },
    { rank: 'SrMod', name: 'Nexusking', color: 'purple' },
    { rank: 'Staff', name: 'maybe you', color: 'yellow' }
];

// Add this function to check room connection status
async function ensureRoomInitialized() {
  if (!room) {
    showNotification('Connecting to multiplayer server...', 'info');
    room = new WebsimSocket();
    await room.initialize();
    
    // Initialize room state if not exists
    if (!room.roomState.userCredits) {
      room.updateRoomState({
        userCredits: {}
      });
    }
    
    if (!room.roomState.userGems) {
      room.updateRoomState({
        userGems: {}
      });
    }
    
    if (!room.roomState.userRanks) {
      room.updateRoomState({
        userRanks: {}
      });
    }
    
    if (!room.roomState.guilds) {
      room.updateRoomState({ guilds: {} });
    }
    
    // Initialize staff list if not present
    if (!room.roomState.staffList) {
      room.updateRoomState({ staffList: INITIAL_STAFF_LIST });
    }
    
    // Initialize NPCs state
    if (!room.roomState.npcs) {
        room.updateRoomState({ npcs: {} });
    }

    // Ensure honor map exists and seed initial honor for current peers/presence
    const honorMap = room.roomState.honor && typeof room.roomState.honor === 'object' ? { ...room.roomState.honor } : {};
    const peersToSeed = Object.values(room.peers || {});
    for (const clientId in room.presence) {
      // use stable user id if available; presence keys are clientIds, map to user ids via room.peers when possible
      const peer = room.peers[clientId];
      const userId = peer?.id || clientId;
      if (honorMap[userId] === undefined) honorMap[userId] = HONOR_INITIAL;
    }
    room.updateRoomState({ honor: honorMap });

    // Load saved rank for current user and apply it immediately
    const savedRank = await loadUserRank();
    // try external tipping source first (this can override savedRank if higher)
    try {
      const tipResult = await checkTipsAndApplyRank();
      if (!tipResult && savedRank && savedRank.rank && savedRank.rank !== 'default') {
        room.updatePresence({
          rank: savedRank.rank,
          color: savedRank.color,
          icon: savedRank.icon
        });
      }
    } catch (e) {
      // fallback to saved rank if tip-check fails
      if (savedRank && savedRank.rank && savedRank.rank !== 'default') {
        room.updatePresence({
          rank: savedRank.rank,
          color: savedRank.color,
          icon: savedRank.icon
        });
      }
    }
    
    return true;
  }
  return true;
}

// Add these variables near the top of the file with other global variables
let chatMessagesArray = [];
const MAX_CHAT_MESSAGES = 50;

// Add this function to create a chat display area
function createChatDisplay() {
  const chatContainer = document.getElementById('chat-display-container');
  const chatToggle = document.getElementById('chat-toggle');

  if (chatToggle && chatContainer) {
    chatToggle.addEventListener('click', () => {
      chatContainer.classList.toggle('hidden');
    });
  }
}

// Add gem purchase functionality
function openGemPurchase() {
  const modal = document.createElement('div');
  modal.className = 'gem-modal';
  modal.innerHTML = `
    <div class="gem-container">
      <h2 class="gem-title">💎 Purchase Gems</h2>
      <div class="gem-options">
        <div class="gem-option">
          <span>100 Gems</span>
          <button class="gem-button" data-gems="100" data-price="0.99">$0.99</button>
        </div>
        <div class="gem-option">
          <span>550 Gems</span>
          <button class="gem-button" data-gems="550" data-price="4.99">$4.99</button>
        </div>
        <div class="gem-option">
          <span>1200 Gems</span>
          <button class="gem-button" data-gems="1200" data-price="9.99">$9.99</button>
        </div>
        <div class="gem-option">
          <span>2500 Gems</span>
          <button class="gem-button" data-gems="2500" data-price="19.99">$19.99</button>
        </div>
        <div class="gem-option">
          <span>6500 Gems</span>
          <button class="gem-button" data-gems="6500" data-price="49.99">$49.99</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  modal.querySelectorAll('.gem-button').forEach(button => {
    button.addEventListener('click', async (e) => {
      const gems = parseInt(e.target.dataset.gems);
      const price = parseFloat(e.target.dataset.price);
      
      // Simulate purchase (in real app, integrate with payment)
      await purchaseGems(gems, price);
      modal.remove();
    });
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Add gem management functions
async function getUserGems() {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  const userGems = room.roomState.userGems || {};
  // If userGems is not an object (e.g., from old state), treat it as empty.
  if (typeof userGems !== 'object' || userGems === null) {
      return 50;
  }
  return userGems[clientId] === undefined ? 50 : userGems[clientId]; // Default to 50 gems for new users
}

async function updateUserGems(amount) {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  // Ensure userGems is treated as an object, even if it was a number from a previous incorrect state.
  let userGems = room.roomState.userGems;
  if (typeof userGems !== 'object' || userGems === null) {
    userGems = {};
  } else {
    // Deep copy to avoid modifying the readonly roomState directly
    userGems = { ...userGems };
  }
  
  const currentGems = userGems[clientId] === undefined ? 50 : userGems[clientId];
  
  userGems[clientId] = Math.max(0, currentGems + amount);
  
  room.updateRoomState({ userGems });
  
  updateGemDisplay();
}

function updateGemDisplay() {
  const gemCount = document.getElementById('gem-count');
  if (gemCount) {
    getUserGems().then(gems => {
      gemCount.textContent = gems;
    });
  }
}

// Add Blow Bucks management functions
async function getUserBlowBucks() {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  const state = room.roomState;
  const userBlowBucks = state?.userBlowBucks || {};
  if (typeof userBlowBucks !== 'object' || userBlowBucks === null) return 0;
  return userBlowBucks[clientId] === undefined ? 0 : userBlowBucks[clientId];
}

async function updateUserBlowBucks(amount) {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  let userBlowBucks = room.roomState.userBlowBucks;
  if (typeof userBlowBucks !== 'object' || userBlowBucks === null) {
      userBlowBucks = {};
  } else {
      userBlowBucks = { ...userBlowBucks };
  }

  const currentBlowBucks = userBlowBucks[clientId] === undefined ? 0 : userBlowBucks[clientId];
  userBlowBucks[clientId] = Math.max(0, currentBlowBucks + amount);

  room.updateRoomState({
    userBlowBucks
  });
  updateBlowBuckDisplay();
}

function updateBlowBuckDisplay() {
    const blowBuckCount = document.getElementById('blow-buck-count');
    if (blowBuckCount) {
        getUserBlowBucks().then(bucks => {
            blowBuckCount.textContent = bucks;
        });
    }
}

// Add absolute setter so the target player persists admin changes themselves
async function setHonorForCurrentUser(newValue) {
  if (!room) await ensureRoomInitialized();
  const userId = room.peers[room.clientId]?.id || room.clientId;
  const honorCol = room.collection('honor');
  const list = await honorCol.filter({ player_id: userId }).getList();
  if (!list || list.length === 0) {
    await honorCol.create({ player_id: userId, honor: newValue });
  } else {
    await honorCol.update(list[0].id, { honor: newValue });
  }
  const honorState = room.roomState.honor || {};
  honorState[userId] = newValue;
  room.updateRoomState({ honor: honorState });
}

// Update the saveUserRank function to ensure proper persistence
async function saveUserRank(rank) {
  if (!room) return;
  
  const userId = room.peers[room.clientId]?.id || room.clientId; // Use stable user ID
  const username = room.peers[room.clientId]?.username || 'Unknown';
  
  // Save to both room state and localStorage for redundancy
  const userRanks = room.roomState.userRanks || {};
  userRanks[userId] = {
    rank: rank.name,
    username: username, // Save username for offline lookup
    color: rank.color,
    icon: rank.icon,
    purchasedAt: Date.now()
  };
  
  // Also save to localStorage for immediate persistence
  localStorage.setItem(`userRank_${userId}`, JSON.stringify({
    rank: rank.name,
    username: username,
    color: rank.color,
    icon: rank.icon,
    purchasedAt: Date.now()
  }));

  // Save this as the default rank for the user
  localStorage.setItem('defaultUserRank', JSON.stringify({
    rank: rank.name,
    username: username,
    color: rank.color,
    icon: rank.icon,
  }));
  
  room.updateRoomState({
    userRanks: userRanks
  });
  
  // Immediately update presence to show the new rank
  room.updatePresence({
    rank: rank.name,
    color: rank.color,
    icon: rank.icon
  });
  
  // Persist the new rank to the database and include mythic fields if relevant
  try {
    await updatePersistentStats({ rank: rank.name });
    // If Mythic, also ensure player_stats has mythic_unlocked/equipped flags
    if (rank.name === 'Mythic') {
      const playerStatsCol = room.collection('player_stats');
      const currentUser = await window.websim.getCurrentUser();
      if (currentUser) {
        const existingList = await playerStatsCol.filter({ id: currentUser.id }).getList();
        const existing = existingList.length > 0 ? existingList[0] : {};
        await playerStatsCol.upsert({
          id: currentUser.id,
          username: currentUser.username,
          mythic_unlocked: true,
          mythic_equipped: true,
          rank: 'Mythic',
          kills: existing.kills || 0,
          deaths: existing.deaths || 0,
          highest_kill_streak: existing.highest_kill_streak || 0
        });
      }
    }
  } catch (e) {
    console.warn('Failed to persist rank to DB', e);
  }
}

// Update the loadUserRank function to check both sources
async function loadUserRank() {
  // First, check for a default rank set after purchase
  const defaultRank = localStorage.getItem('defaultUserRank');
  if (defaultRank) {
    try {
      const parsedRank = JSON.parse(defaultRank);
      if (parsedRank && typeof parsedRank === 'object' && parsedRank.rank) {
        return parsedRank;
      }
    } catch (e) {
      console.error("Error parsing default user rank from localStorage", e);
      localStorage.removeItem('defaultUserRank');
    }
  }

  if (!room) return null;
  
  const userId = room.peers[room.clientId]?.id || room.clientId; // Use stable user ID
  
  // Check localStorage for a user-specific rank
  const localRank = localStorage.getItem(`userRank_${userId}`);
  if (localRank) {
    try {
        const parsedRank = JSON.parse(localRank);
        if (parsedRank && typeof parsedRank === 'object') {
            return parsedRank;
        }
    } catch (e) {
        console.error("Error parsing user rank from localStorage", e);
        localStorage.removeItem(`userRank_${userId}`);
    }
  }
  
  // Check room state as fallback (including mythic flags)
  const userRanks = room.roomState.userRanks || {};
  const userRank = userRanks[userId];
  if (userRank) {
    return userRank;
  }

  // Finally check DB player_stats for mythic flags
  try {
    const playerStatsCol = room.collection('player_stats');
    const list = await playerStatsCol.filter({ id: userId }).getList();
    if (list.length > 0) {
      const stats = list[0];
      if (stats.mythic_unlocked) {
        return { rank: 'Mythic', color: '#AA00AA', icon: 'mythic' };
      }
      if (stats.rank) {
        return { rank: stats.rank, color: stats.color || '#ffffff', icon: stats.icon || '' };
      }
    }
  } catch (e) {
    console.warn('Failed to load rank from DB', e);
  }
  
  return userRank || { rank: 'default', color: '#ffffff', icon: '' };
}

// NEW: Function to update persistent player stats in the database
async function updatePersistentStats(statsToUpdate) {
    if (!room) await ensureRoomInitialized();
    const currentUser = await window.websim.getCurrentUser();
    if (!currentUser) return;

    const playerStatsCol = room.collection('player_stats');

    // Get current stats from DB
    const existingStatsList = await playerStatsCol.filter({ id: currentUser.id }).getList();
    let existingStats = existingStatsList.length > 0 ? existingStatsList[0] : { kills: 0, deaths: 0, highest_kill_streak: 0, rank: 'default' };
    
    // Get current presence for up-to-date rank
    const playerPresence = room.presence[room.clientId] || {};
    
    // Merge new stats with existing ones
    const newStats = {
        id: currentUser.id,
        username: currentUser.username,
        rank: playerPresence.rank || existingStats.rank,
        ...existingStats,
        ...statsToUpdate
    };
    
    await playerStatsCol.upsert(newStats);
}

// Simulate gem purchase (replace with actual payment integration)
async function purchaseGems(gems, price) {
  // In a real app, integrate with payment provider
  await updateUserGems(gems);
  showNotification(`Added ${gems} gems!`, 'success');
}

// Update these functions to handle undefined room state
async function getUserCredits() {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  const state = room.roomState;
  const userCredits = state?.userCredits || {};
  if (typeof userCredits !== 'object' || userCredits === null) return 1000;
  return userCredits[clientId] === undefined ? 1000 : userCredits[clientId];
}

async function updateUserCredits(amount) {
  if (!room) {
    await ensureRoomInitialized();
  }
  const clientId = room.clientId;
  let userCredits = room.roomState.userCredits;
  if (typeof userCredits !== 'object' || userCredits === null) {
      userCredits = {};
  } else {
      userCredits = { ...userCredits };
  }

  const currentCredits = userCredits[clientId] === undefined ? 1000 : userCredits[clientId];
  userCredits[clientId] = Math.max(0, currentCredits + amount);

  room.updateRoomState({
    userCredits
  });
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -100%);
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    padding: 20px 40px;
    border-radius: 10px;
    font-weight: bold;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

// Add this function near the other chat-related functions
function addChatMessage(displayName, rank, message, tag) {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;

  // Create message element
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message-item';
  messageDiv.style.cssText = `
    padding: 5px 8px;
    margin-bottom: 2px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 8px;
    color: white;
    font-size: 13px;
    word-break: break-word;
  `;

  // Format the message with rank
  const rankColor = getRankColor(rank);
  const tagHtml = tag ? `<span class="player-tag" style="color:${tag.color};">${tag.name}</span>` : '';

  // If rank has a formatted Minecraft-style format string, render that instead of plain [RANK]
  const rankData = getRankData(rank);
  let rankHtml = '';
  if (rankData && rankData.format) {
    // Use parseMinecraftCodes to produce the fancy § formatting
    rankHtml = parseMinecraftCodes(rankData.format.replace('{username}', displayName));
  } else {
    rankHtml = `<span style="color: ${rankColor}; font-weight: bold;">[${rank}]</span>`;
  }

  // If Mythic, wrap the rank HTML with mythical class for animated gradient glow
  if (rank === 'Mythic') {
    rankHtml = `<span class="mythical-name inline" style="--mythic-duration:${MYTHIC_RB_ANIM_DURATION}s; --mythic-red:${MYTHIC_RB_RED}; --mythic-blue:${MYTHIC_RB_BLUE}; --mythic-glow-size:${MYTHIC_RB_GLOW_SIZE};">${rankHtml}</span>`;
  }

  // Use innerHTML to allow parsed formatting (safe because input is controlled by server code)
  messageDiv.innerHTML = `
    ${rankHtml}
    <span style="color: #ffffff; margin-left:6px;">${displayName}${tagHtml}:</span>
    <span style="color: #e0e0e0; margin-left:6px;">${message}</span>
  `;

  // Add to container
  chatContainer.appendChild(messageDiv);
  
  // Keep only last 50 messages
  while (chatContainer.children.length > MAX_CHAT_MESSAGES) {
    chatContainer.removeChild(chatContainer.firstChild);
  }
  
  // Auto-scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Helper function to get rank color
function getRankColor(rank) {
  const rankData = [...shopRanks, ...staffRanks].find(r => r.name === rank);
  return rankData ? rankData.color : '#ffffff';
}

// Helper function to get rank data
function getRankData(rankName) {
    return [...shopRanks, ...staffRanks].find(r => r.name === rankName);
}

// Add this function to update the scoreboard with current kills
function updateScoreboard() {
  if (!room || !room.presence || !room.peers) {
    const lc = document.getElementById('leaderboard-content');
    if (lc) lc.innerHTML = '';
    return;
  }
  const leaderboardContent = document.getElementById('leaderboard-content');
  const entries = [];
  
  // Collect all players with their kill counts
  for (const clientId in room.presence) {
    const playerPresence = room.presence[clientId];
    const peerInfo = room.peers[clientId];
    
    if (peerInfo) {
      entries.push({
        username: peerInfo.username,
        displayName: playerPresence.nickname || peerInfo.username,
        kills: playerPresence.kills || 0,
        deaths: playerPresence.deaths || 0,
        rank: playerPresence.rank || 'default',
        clientId,
        tag: playerPresence.tag
      });
    }
  }
  
  // Sort by kills descending
  entries.sort((a, b) => (b.kills || 0) - (a.kills || 0));
  
  // Clear previous content
  leaderboardContent.innerHTML = '';
  
  // Add header
  const headerDiv = document.createElement('div');
  headerDiv.className = 'score-entry score-header';
  headerDiv.innerHTML = `
    <div class="score-rank">#</div>
    <div class="score-name">Player</div>
    <div class="score-kills">Kills</div>
  `;
  leaderboardContent.appendChild(headerDiv);
  
  // Add entries
  entries.forEach((entry, index) => {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'score-entry';
    
    const rankData = getRankData(entry.rank);
    let displayNameHtml = `<span style="color: ${rankData?.color || '#ffffff'};">${entry.displayName}</span>`;
    if (entry.tag) {
        displayNameHtml += `<span class="player-tag" style="color: ${entry.tag.color};">${entry.tag.name}</span>`;
    }

    if (rankData && rankData.format) {
      displayNameHtml = parseMinecraftCodes(rankData.format.replace('{username}', entry.displayName));
    }
    
    entryDiv.innerHTML = `
      <div class="score-rank">${index + 1}</div>
      <div class="score-name">${displayNameHtml}</div>
      <div class="score-kills">${entry.kills || 0}</div>`;
    leaderboardContent.appendChild(entryDiv);
  });
  
  // Show leaderboard if it was hidden
  leaderboardContent.classList.remove('hidden');
}

// Add helper function to determine rank based on kills
function getRankForKills(kills) {
    if (kills >= 100) return DIAMOND_RANK;
    if (kills >= 50) return PLATINUM_RANK;
    if (kills >= 25) return GOLD_RANK;
    if (kills >= 10) return SILVER_RANK;
    if (kills >= 1) return BRONZE_RANK;
    return DEFAULT_RANK;
}

// Update the initialization to ensure player stats exist
// In the startGame function, after room initialization, add:
// Initialize player stats for current user
(async () => {
    try {
        const currentUser = await window.websim.getCurrentUser();
        if (!currentUser) return;
        
        const playerStatsCol = room.collection('player_stats');
        const existingStatsList = await playerStatsCol.filter({ id: currentUser.id }).getList();
        
        if (existingStatsList.length === 0) {
            // Create initial stats
            await playerStatsCol.upsert({
                id: currentUser.id,
                username: currentUser.username,
                kills: 0,
                deaths: 0,
                highest_kill_streak: 0,
                rank: DEFAULT_RANK
            });
        }
    } catch (e) {
        console.error('Failed to initialize player stats', e);
    }
})();

async function main() {
  // Show main menu first
  await showMainMenu();
  addShopButton();
}

function showMainMenu() {
  // Create main menu HTML
  const mainMenu = document.createElement('div');
  mainMenu.id = 'main-menu';
  
  const particlesContainer = document.createElement('div');
  particlesContainer.id = 'menu-particles';
  
  const title = document.createElement('h1');
  title.className = 'menu-title';
  title.textContent = '3D MULTIPLAYER';
  
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'menu-buttons';
  
  const playButton = document.createElement('button');
  playButton.className = 'menu-button';
  playButton.textContent = 'ENTER WORLD';
  
  const aboutButton = document.createElement('button');
  aboutButton.className = 'menu-button';
  aboutButton.textContent = 'ABOUT';
  
  /* @tweakable Whether to show the "Flicker night" button in the main menu (true/false) */
  const SHOW_FLICKER_NIGHT = false;
  
  const flickerNightButton = document.createElement('button');
  flickerNightButton.className = 'menu-button horror-button';
  flickerNightButton.innerHTML = 'New horror game "Flicker night"';
  
  // Only add the Flicker Night button when the tweakable flag enables it
  buttonsContainer.appendChild(playButton);
  if (SHOW_FLICKER_NIGHT) {
    buttonsContainer.appendChild(flickerNightButton);
  }
  buttonsContainer.appendChild(aboutButton);
  
  mainMenu.appendChild(particlesContainer);
  mainMenu.appendChild(title);
  mainMenu.appendChild(buttonsContainer);
  
  document.body.appendChild(mainMenu);
  
  // Create floating particles
  createMenuParticles(particlesContainer);
  
  // Button event listeners
  playButton.addEventListener('click', () => {
    startGame(mainMenu);
  });
  
  if (SHOW_FLICKER_NIGHT) {
    flickerNightButton.addEventListener('click', () => {
      showFlickerNightMessage();
    });
  }
  
  aboutButton.addEventListener('click', () => {
    alert('A beautiful 3D multiplayer world with real-time chat and movement. Use WASD to move, Space to jump, and / to chat!');
  });

  const leaderboardToggle = document.querySelector('.leaderboard-toggle');
  const leaderboardContent = document.getElementById('leaderboard-content');

  if (leaderboardToggle && leaderboardContent) {
    leaderboardToggle.addEventListener('click', () => {
      leaderboardContent.classList.toggle('hidden');
      if (!leaderboardContent.classList.contains('hidden')) updateScoreboard();
    });
  }
}

function createMenuParticles(container) {
  const createParticle = () => {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 6 + 2;
    const left = Math.random() * 100;
    const duration = Math.random() * 10 + 10;
    const delay = Math.random() * 5;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${left}%`;
    particle.style.animationDuration = `${duration}s`;
    particle.style.animationDelay = `${delay}s`;
    
    container.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
      if (container.contains(particle)) {
        container.removeChild(particle);
      }
    }, (duration + delay) * 1000);
  };
  
  // Create initial particles
  for (let i = 0; i < 20; i++) {
    setTimeout(() => createParticle(), Math.random() * 2000);
  }
  
  // Continue creating particles
  const particleInterval = setInterval(() => {
    if (document.getElementById('main-menu')) {
      createParticle();
    } else {
      clearInterval(particleInterval);
    }
  }, 800);
}

// Update the startGame function to properly load ranks on initialization
async function startGame(menuElement) {
  // Add fade out animation
  menuElement.classList.add('menu-fade-out');
  
  // Wait for animation to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Remove menu
  document.body.removeChild(menuElement);
  
  // Initialize WebsimSocket for multiplayer functionality
  room = new WebsimSocket(); // Assign to global room variable
  await room.initialize();
  
  // Initialize room state with user credits if not exists
  if (!room.roomState.userCredits) {
    room.updateRoomState({
      userCredits: {}
    });
  }
  
  // Initialize gems in room state
  if (!room.roomState.userGems) {
    room.updateRoomState({
      userGems: {}
    });
  }
  
  // Initialize staff list in room state
  if (!room.roomState.staffList) {
    room.updateRoomState({ staffList: INITIAL_STAFF_LIST });
  }

  // Generate a random player name if not available
  const playerInfo = room.peers[room.clientId] || {};
  const playerName = playerInfo.username || `Player${Math.floor(Math.random() * 1000)}`;

  // Make Itx_Meow owner of the game
  if (playerName === 'Itx_Meow') {
    const currentOwnerId = room.roomState?.serverOwner;
    // Only auto-assign if no owner exists yet
    if (!currentOwnerId) {
      const ownerRank = staffRanks.find(r => r.name === 'Owner');
      if (ownerRank) {
        // Persist owner by user ID and in userRanks so it survives restarts
        const ownerId = room.peers[room.clientId]?.id || room.clientId;
        const userRanks = room.roomState.userRanks || {};
        userRanks[ownerId] = { rank: ownerRank.name, color: ownerRank.color, icon: ownerRank.icon, assignedAt: Date.now() };
        room.updateRoomState({ userRanks, serverOwner: ownerId });
        await saveUserRank(ownerRank);
        showNotification('You have been set as the server owner.', 'success');
        room.send({ type: 'chat', username: 'System', displayName: 'System', rank: 'default', message: `${playerName} is now the server owner.`, timestamp: Date.now(), senderId: room.clientId });
      }
    }
  }
  // Auto-assign configured owner username full admin privileges
  if (playerName.toLowerCase() === (AUTO_OWNER_USERNAME || '').toLowerCase()) {
    const ownerRank = staffRanks.find(r => r.name === 'Owner');
    if (ownerRank) {
      const userId = room.peers[room.clientId]?.id || room.clientId;
      const userRanks = room.roomState.userRanks || {};
      userRanks[userId] = { rank: ownerRank.name, color: ownerRank.color, icon: ownerRank.icon, assignedAt: Date.now(), autoAssigned: true };
      room.updateRoomState({ userRanks, serverOwner: userId });
      await saveUserRank(ownerRank);
      showNotification(`${playerName} has been auto-assigned as the server owner.`, 'success');
      room.send({ type: 'chat', username: 'System', displayName: 'System', rank: 'default', message: `${playerName} is now the server owner.`, timestamp: Date.now(), senderId: room.clientId });
    }
  }
  // Make BlueLxgend SrDev of the game (can use all admin commands)
  if (playerName === 'BlueLxgend') {
    const srdevRank = staffRanks.find(r => r.name === 'SrDev');
    if (srdevRank) await saveUserRank(srdevRank);
  }
  // Add Ego9x as YouTube rank
  if (playerName === 'Ego9x') {
    const youtubeRank = staffRanks.find(r => r.name === 'YouTube');
    if (youtubeRank) await saveUserRank(youtubeRank);
  }
  
  // Make craftyyy a dev
  if (playerName.toLowerCase() === newDevUsername.toLowerCase()) {
    const devRank = staffRanks.find(r => r.name === 'Dev');
    if (devRank) await saveUserRank(devRank);
  }
  
  // Make NexusKing a SrMod
  if (playerName.toLowerCase() === newSrModUsername.toLowerCase()) {
    const srModRank = staffRanks.find(r => r.name === 'SrMod');
    if (srModRank) await saveUserRank(srModRank);
  }
  
  // Safe initial position values
  const playerX = (Math.random() * 10) - 5;
  const playerZ = (Math.random() * 10) - 5;

  // Setup Three.js scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Light sky blue background
  
  // Create barriers, trees, clouds and platforms
  createBattleRoyaleMap(scene);
  
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);
  
  // Object to store other players
  const otherPlayers = {};
  const playerLabels = {};
  const guildLabels = {};
  const chatMessages = {};
  const npcObjects = {};
  const npcLabels = {};
  const npcMessages = {};
  const timerElements = {};
  
  // Create player model
  const playerModel = createPlayerModel(THREE, playerName);
  scene.add(playerModel);
  
  // Initialize player controls
  playerControls = new PlayerControls(scene, room, {
    renderer: renderer,
    initialPosition: {
      x: playerX,
      y: 0.5,
      z: playerZ
    },
    playerModel: playerModel
  });
  const camera = playerControls.getCamera();
  
  // Handle presence update requests
  room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
    if (updateRequest.type === 'setFlying') {
        const isFlying = updateRequest.flying;
        // Update my own presence
        room.updatePresence({ isFlying });
        // Also update playerControls to enable/disable flying logic
        if (playerControls) {
            playerControls.setFlying(isFlying);
        }
        const fromPeer = room.peers[fromClientId];
        const fromUsername = fromPeer ? fromPeer.username : "An admin";
        showNotification(`Flying ${isFlying ? 'enabled' : 'disabled'} by ${fromUsername}.`, 'info');
    }
    if (updateRequest.type === 'setNickname') {
        const nickname = updateRequest.nickname;
        room.updatePresence({ nickname });
        const fromPeer = room.peers[fromClientId];
        const fromUsername = fromPeer ? fromPeer.username : "An admin";
        if (nickname) {
            showNotification(`Your name has been changed to "${nickname}" by ${fromUsername}.`, 'info');
        } else {
            showNotification(`Your name has been reset by ${fromUsername}.`, 'info');
        }
    }
    if (updateRequest.type === 'damage') {
        if (room.presence[room.clientId]?.godMode) {
            return; // Player is in god mode, ignore damage
        }
        const currentHealth = room.presence[room.clientId].health || 100;
        const newHealth = Math.max(0, currentHealth - updateRequest.amount);
        room.updatePresence({ health: newHealth });
        updateHealthBar(newHealth);

        if (newHealth <= 0) {
            // Honor transfer logic (zero-sum)
            (async () => {
                try {
                    // 'from' is the clientId of the killer (if present)
                    const killerClientId = updateRequest.from;
                    if (killerClientId) {
                        const killerPeer = room.peers[killerClientId] || {};
                        const killerUserId = killerPeer.id || killerClientId;
                        const victimPeer = room.peers[room.clientId] || {};
                        const victimUserId = victimPeer.id || room.clientId;

                        // Read current honor
                        const victimHonor = await getHonorForUser(victimUserId);
                        const range = getPenaltyRangeForHonor(victimHonor);
                        const amount = randomInt(range[0], range[1]);

                        // Ensure we don't over-deduct (cap at victim honor)
                        const deduct = Math.min(amount, victimHonor);

                        if (deduct > 0) {
                            // Transfer: subtract from victim, add to killer
                            await setHonorForUser(victimUserId, victimHonor - deduct);
                            const killerHonorBefore = await getHonorForUser(killerUserId);
                            await setHonorForUser(killerUserId, killerHonorBefore + deduct);

                            // Broadcast a system chat message about honor transfer
                            const killerName = room.peers[killerClientId]?.username || 'Someone';
                            const victimName = room.peers[room.clientId]?.username || 'Someone';
                            room.send({
                              type: 'chat',
                              username: 'System',
                              displayName: 'System',
                              rank: 'default',
                              message: `${killerName} gained ${deduct} honor by eliminating ${victimName} (zero-sum).`,
                              timestamp: Date.now(),
                              senderId: room.clientId
                            });

                            // Persist updated stats for both players
                            updatePersistentStats({}); // best-effort to refresh DB entries (setHonorForUser already updated player_stats honor)
                        }
                    }
                } catch (e) {
                    console.error('Honor transfer failed', e);
                }
            })();
            
            // Player died.
            if (updateRequest.from) { // 'from' is the clientId of the killer
                room.requestPresenceUpdate(updateRequest.from, { type: 'incrementKills' });
                
                // Announce elimination to everyone
                const killerName = room.peers[updateRequest.from]?.username || 'Someone';
                const victimName = room.peers[room.clientId]?.username || 'Someone';
                room.send({
                  type: 'chat',
                  username: 'System',
                  rank: 'default',
                  message: `${killerName} eliminated ${victimName}`,
                  timestamp: Date.now(),
                  senderId: room.clientId // any id; recipients filter uses senderId to prevent duplication
                });
            }
            
            const currentDeaths = room.presence[room.clientId].deaths || 0;
            const newDeaths = currentDeaths + 1;
            room.updatePresence({ deaths: newDeaths });
            
            // Reset kill streak on death
            room.updatePresence({ killStreak: 0 });
            
            // Update deaths in persistent stats
            (async () => {
                try {
                    const currentUser = await window.websim.getCurrentUser();
                    if (!currentUser) return;
                    
                    const playerStatsCol = room.collection('player_stats');
                    const existingStatsList = await playerStatsCol.filter({ id: currentUser.id }).getList();
                    
                    let existingStats = existingStatsList.length > 0 ? existingStatsList[0] : { kills: 0, deaths: 0, highest_kill_streak: 0, rank: DEFAULT_RANK };
                    const currentDeaths = existingStats.deaths || 0;
                    
                    const newStats = {
                        id: currentUser.id,
                        username: currentUser.username,
                        kills: existingStats.kills || 0,
                        deaths: currentDeaths + 1,
                        highest_kill_streak: existingStats.highest_kill_streak || 0,
                        rank: existingStats.rank || DEFAULT_RANK
                    };
                    
                    await playerStatsCol.upsert(newStats);
                } catch (e) {
                    console.error('Failed to update player stats on death', e);
                }
            })();
            
            updatePersistentStats({ deaths: newDeaths });

            respawnPlayer();
        }
    }
    if (updateRequest.type === 'incrementKills') {
        const currentKills = room.presence[room.clientId].kills || 0;
        const currentStreak = room.presence[room.clientId].killStreak || 0;
        const newKills = currentKills + 1;
        const newStreak = currentStreak + 1;
        
        room.updatePresence({ 
            kills: newKills,
            killStreak: newStreak
        });
        
        // Check if this is a milestone streak that should be broadcast
        if (newStreak === MIN_KILL_STREAK || 
            (newStreak > MIN_KILL_STREAK && (newStreak - MIN_KILL_STREAK) % KILL_STREAK_INTERVAL === 0)) {
          const playerInfo = room.peers[room.clientId];
          const playerName = playerInfo ? playerInfo.username : 'A player';
          
          // Broadcast streak milestone to everyone
          room.send({
            type: 'chat',
            username: 'System',
            displayName: 'System',
            rank: 'default',
            message: `${playerName} is on a ${newStreak} kill streak!`,
            timestamp: Date.now(),
            senderId: room.clientId
          });
        }
        
        // Update persistent stats with new rank
        (async () => {
          try {
            const currentUser = await window.websim.getCurrentUser();
            if (!currentUser) return;
            
            const playerStatsCol = room.collection('player_stats');
            const existingStatsList = await playerStatsCol.filter({ id: currentUser.id }).getList();
            
            let existingStats = existingStatsList.length > 0 ? existingStatsList[0] : { kills: 0, deaths: 0, highest_kill_streak: 0, rank: DEFAULT_RANK };
            const newHighestStreak = Math.max(existingStats.highest_kill_streak || 0, newStreak);
            const newRank = getRankForKills(newKills);
            
            const newStats = {
              id: currentUser.id,
              username: currentUser.username,
              kills: newKills,
              deaths: existingStats.deaths || 0,
              highest_kill_streak: newHighestStreak,
              rank: newRank
            };
            
            await playerStatsCol.upsert(newStats);
          } catch (e) {
            console.error('Failed to update player stats on kill', e);
          }
        })();
    }
  });
  
  // Load and set user's rank immediately after room initialization
  const savedRank = await loadUserRank();
  // try external tipping source first (this can override savedRank if higher)
  try {
    const tipResult = await checkTipsAndApplyRank();
    if (!tipResult && savedRank && savedRank.rank && savedRank.rank !== 'default') {
      room.updatePresence({
        rank: savedRank.rank,
        color: savedRank.color,
        icon: savedRank.icon
      });
    }
  } catch (e) {
    if (savedRank && savedRank.rank && savedRank.rank !== 'default') {
      room.updatePresence({
        rank: savedRank.rank,
        color: savedRank.color,
        icon: savedRank.icon
      });
    }
  }
  
  // Apply saved tag for current user if present
  const currentUser = await window.websim.getCurrentUser();
  if (currentUser) {
      const playerTagsCol = room.collection('player_tags');
      const savedTagList = await playerTagsCol.filter({ id: currentUser.id }).getList();
      if (savedTagList.length > 0) {
          const savedTag = savedTagList[0];
          room.updatePresence({ tag: { name: savedTag.tag_name, color: savedTag.tag_color } });
      }
  }
  
  // Initialize Gun
  const gun = new Gun(scene, room, camera);
  
  // Shooting event listeners
  let isFiring = false;
  const startFiring = () => { isFiring = true; };
  const stopFiring = () => { isFiring = false; };

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && playerControls && playerControls.enabled) startFiring();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) stopFiring();
  });

  const fireButton = document.getElementById('fire-button');
  if (fireButton) {
    fireButton.addEventListener('touchstart', (e) => { e.preventDefault(); startFiring(); });
    fireButton.addEventListener('touchend', (e) => { e.preventDefault(); stopFiring(); });
  }

  // Handle incoming fire events from other players
  room.onmessage = (event) => {
    // built-in connection events
    if (event.data.type === 'connected') {
        const username = event.data.username || 'A player';
        const clientId = event.data.clientId;
        
        // Get the player's rank and nickname from presence
        const playerPresence = room.presence[clientId];
        const playerRank = playerPresence?.rank || 'default';
        const displayName = playerPresence?.nickname || username;
        
        // Show join message with rank and nickname
        addChatMessage(displayName, playerRank, `${displayName} [${playerRank}] joined the game`);
        
        // Broadcast join message to all players
        room.send({
            type: 'chat',
            username: 'System',
            displayName: 'System',
            rank: 'default',
            message: `${displayName} has joined the game.`,
            timestamp: Date.now(),
            senderId: room.clientId
        });
        return;
    }
    if (event.data.type === 'disconnected') {
        const username = event.data.username || 'A player';
        const clientId = event.data.clientId;
        
        // Get the player's nickname from presence
        const playerPresence = room.presence[clientId];
        const displayName = playerPresence?.nickname || username;
        
        addChatMessage(displayName, 'default', `${displayName} left the game`);
        
        // Broadcast leave message to all players
        room.send({
            type: 'chat',
            username: 'System',
            displayName: 'System',
            rank: 'default',
            message: `${displayName} has left the game.`,
            timestamp: Date.now(),
            senderId: room.clientId
        });
        return;
    }
    
    // custom events
    if (event.data.type === 'fire') {
      gun.createProjectile(event.data);
      return;
    }
    if (event.data.type === 'broadcast') {
        // For multi-line messages like /staff list
        const { message, senderId } = event.data;
        if (senderId !== room.clientId) {
          addChatMessage('System', 'Admin', message);
        }
        return;
    }
    if (event.data.type === 'chat') {
      const { username, displayName, rank, message, senderId, tag } = event.data;
      // Only display chat messages from other players (local messages are appended locally)
      if (senderId !== room.clientId) {
        // Use displayName (nickname) if available, otherwise fallback to username
        const chatDisplayName = displayName || username;
        addChatMessage(chatDisplayName, rank, message, tag);
      }
      return;
    }
  };

  // Function to check if a spawn point is valid (not inside a barrier)
  function isSpawnPointValid(position, scene) {
    const collidableMeshes = scene.children.filter(child => child.userData.isBarrier && child.visible);
    const playerHeight = 1.8;
    const playerRadius = 0.5; // Use a slightly larger radius for safety
    const checkPoint = new THREE.Vector3(position.x, position.y + playerHeight / 2, position.z);
    const playerBox = new THREE.Box3();
    playerBox.setFromCenterAndSize(checkPoint, new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2));

    for (const mesh of collidableMeshes) {
      const meshBox = new THREE.Box3().setFromObject(mesh);
      if (playerBox.intersectsBox(meshBox)) {
        return false; // Invalid spawn point, it's inside something
      }
    }
    return true; // Spawn point is clear
  }

  // Function to get a safe spawn point
  function getSafeSpawnPoint() {
      let position;
      let isValid = false;
      let attempts = 0;
      const maxAttempts = 10;
  
      while (!isValid && attempts < maxAttempts) {
          position = {
              x: (Math.random() * 80) - 40, // Wider spawn area
              y: 50,
              z: (Math.random() * 80) - 40,
          };
          isValid = isSpawnPointValid(position, scene);
          attempts++;
      }
  
      if (!isValid) { // Fallback if no safe spot is found
          console.warn("Could not find a safe spawn point. Spawning at default.");
          position = { x: 0, y: 50, z: 0 };
      }
      return position;
  }

  // Respawn function
  function respawnPlayer() {
    showNotification("You were eliminated! Respawning...", "error");
    const respawnPosition = getSafeSpawnPoint();
    
    playerControls.teleport(respawnPosition.x, respawnPosition.y, respawnPosition.z);
    room.updatePresence({
        health: 100,
        x: respawnPosition.x,
        y: respawnPosition.y,
        z: respawnPosition.z,
    });
    updateHealthBar(100);
    
    // Update leaderboard after respawn
    updateScoreboard();
  }

  // Update health bar UI
  function updateHealthBar(health) {
      /* @tweakable The health bar background color */
      const healthBarBg = "rgba(0, 0, 0, 0.5)";
      /* @tweakable The health bar fill color */
      const healthBarFill = "linear-gradient(90deg, #ff4d4d, #ff8c4d)";
      
      const healthBar = document.getElementById('health-bar');
      if (healthBar) {
          healthBar.style.width = `${health}%`;
          healthBar.style.background = healthBarFill;
      }
  }

  // Ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // Directional light (sun)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -25;
  dirLight.shadow.camera.right = 25;
  dirLight.shadow.camera.top = 25;
  dirLight.shadow.camera.bottom = -25;
  scene.add(dirLight);
  
  // Ground
  const groundGeometry = new THREE.PlaneGeometry(150, 150);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x99856A, // Sandy brown color for battle royale map
    roughness: 0.9,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2; // Rotate to horizontal
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper for better spatial awareness
  const gridHelper = new THREE.GridHelper(150, 150);
  scene.add(gridHelper);
  
  // Create DOM element for player name label
  function createPlayerLabel(playerId, username) {
    const label = document.createElement('div');
    label.className = 'player-name';
    label.textContent = username;
    label.style.color = 'white';
    label.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    label.style.background = 'none';
    label.style.border = 'none';
    label.style.padding = '0';
    
    document.getElementById('chat-and-npc-container').appendChild(label);
    return label;
  }
  
  // Create DOM element for player guild label
  function createPlayerGuildLabel(playerId) {
      const label = document.createElement('div');
      label.className = 'player-name player-guild';
      label.id = `guild-${playerId}`;
      document.getElementById('chat-and-npc-container').appendChild(label);
      return label;
  }
  
  // Create DOM element for chat message
  function createChatMessage(playerId) {
    const message = document.createElement('div');
    message.className = 'chat-message';
    message.style.color = 'white';
    message.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    message.style.background = 'none';
    message.style.border = 'none';
    message.style.padding = '0';
    message.style.display = 'none';
    
    document.getElementById('chat-and-npc-container').appendChild(message);
    return message;
  }
  
  // Create chat input container
  const chatInputContainer = document.createElement('div');
  chatInputContainer.id = 'chat-input-container';
  const chatInput = document.createElement('input');
  chatInput.id = 'chat-input';
  chatInput.type = 'text';
  chatInput.maxLength = 100;
  chatInput.placeholder = 'Type a message or command...';
  chatInputContainer.appendChild(chatInput);
  
  // Add close button for chat input
  const closeChat = document.createElement('div');
  closeChat.id = 'close-chat';
  closeChat.innerHTML = '✕';
  chatInputContainer.appendChild(closeChat);
  
  document.getElementById('game-container').appendChild(chatInputContainer);
  
  // Create chat button for all devices
  const chatButton = document.createElement('div');
  chatButton.id = 'chat-button';
  chatButton.innerText = 'CHAT';
  document.getElementById('game-container').appendChild(chatButton);
  
  // Chat event listeners
  /* @tweakable Enable or disable the global chat key handler (useful for debugging key-related errors) */
  const ENABLE_GLOBAL_CHAT_KEYS = true;

  document.addEventListener('keydown', (e) => {
    if (!ENABLE_GLOBAL_CHAT_KEYS) return;
    // Defensive guards to avoid reading properties of null/undefined
    if (!chatInputContainer || !chatInput) return;

    try {
      if (e.key === '/' && chatInputContainer.style.display !== 'block') {
        e.preventDefault();
        openChatInput();
      } else if (e.key === 'Escape' && chatInputContainer.style.display === 'block') {
        closeChatInput();
      } else if (e.key === 'Enter' && chatInputContainer.style.display === 'block') {
        sendChatMessage();
      }
    } catch (err) {
      console.warn('Chat key handler error (ignored):', err);
    }
  });
  
  closeChat.addEventListener('click', () => {
    closeChatInput();
  });
  
  chatButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (chatInputContainer.style.display === 'block') {
      closeChatInput();
    } else {
      openChatInput();
    }
  });
  
  function openChatInput() {
    chatInputContainer.style.display = 'block';
    chatInput.focus();
    
    // Disable player controls while chatting
    if (playerControls) {
      playerControls.enabled = false;
    }
  }
  
  function closeChatInput() {
    chatInputContainer.style.display = 'none';
    chatInput.value = '';
    
    // Re-enable player controls
    if (playerControls) {
      playerControls.enabled = true;
    }
  }
  
  function sendChatMessage() {
    const message = chatInput.value.trim();
    if (message) {
      if (message.startsWith('/')) {
        handleCommand(message);
        chatInput.value = '';
        closeChatInput();
        return;
      }
      
      // Get current player info
      const playerInfo = room.peers[room.clientId] || {};
      const playerName = playerInfo.username || 'Unknown';
      const playerPresence = room.presence[room.clientId] || {};
      const playerRank = playerPresence.rank || 'default';
      const displayName = playerPresence.nickname || playerName; // Use nickname if available
      const playerTag = playerPresence.tag; // Get the player's tag from presence
      
      // Send chat message to all players via event
      room.send({
        type: 'chat',
        username: playerName, // Always send real username in the event
        displayName: displayName, // Send display name separately
        rank: playerRank,
        message: message,
        tag: playerTag, // Include tag in the chat event
        timestamp: Date.now(),
        senderId: room.clientId
      });
      
      // Add message locally using display name
      addChatMessage(displayName, playerRank, message, playerTag);
      
      // Clear and close input
      chatInput.value = '';
      closeChatInput();
    }
  }

  function handleCommand(message) {
    const localPlayerPresence = room.presence[room.clientId];
    const localPlayerRank = localPlayerPresence?.rank || 'default';

    const [command, ...args] = message.substring(1).split(' ');
    const fullArgs = args.join(' ');
    
    switch (command.toLowerCase()) {
        case 'claimbuck': {
            updateUserBlowBucks(100);
            showNotification(`You claimed 100 Blow Bucks!`, "success");
            break;
        }
        case 'createguild': {
            if (localPlayerPresence.guildId) {
                showNotification("You are already in a guild. Leave it first to create a new one.", "error");
                return;
            }

            const guildName = fullArgs.trim();
            if (!guildName) {
                showNotification("Usage: /createguild <name>", "error");
                return;
            }

            if (guildName.split(' ').length > 4) {
                showNotification("Guild name cannot be more than 4 words.", "error");
                return;
            }
            
            const guilds = room.roomState.guilds || {};
            const existingGuild = Object.values(guilds).find(g => g.name.toLowerCase() === guildName.toLowerCase());
            if (existingGuild) {
                showNotification(`A guild with the name "${guildName}" already exists.`, "error");
                return;
            }

            const guildId = `guild-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const newGuild = {
                id: guildId,
                name: guildName,
                owner: room.clientId,
                members: { [room.clientId]: true }
            };

            const updatedGuilds = { ...guilds, [guildId]: newGuild };
            room.updateRoomState({ guilds: updatedGuilds });
            room.updatePresence({ guildId: guildId, guildName: guildName });
            showNotification(`Guild "${guildName}" created successfully!`, "success");
            break;
        }
        case 'nick': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const [targetUsername, newNickname] = args;
            if (!targetUsername || !newNickname) {
                showNotification(`Usage: /nick (playername) (newname)`, "error");
                return;
            }

            const targetClientId = Object.keys(room.peers).find(id => room.peers[id].username.toLowerCase() === targetUsername.toLowerCase());

            if (!targetClientId) {
                showNotification(`Player "${targetUsername}" not found.`, "error");
                return;
            }

            room.requestPresenceUpdate(targetClientId, { type: 'setNickname', nickname: newNickname });
            showNotification(`Set ${targetUsername}'s nickname to ${newNickname}.`, 'success');
            break;
        }
        case 'unnick': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const targetUsername = args[0];
            if (!targetUsername) {
              showNotification(`Please specify a player. Usage: /${command} (playername)`, "error");
              return;
            }
        
            let targetClientId = null;
            for (const clientId in room.peers) {
                if (room.peers[clientId].username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetClientId = clientId;
                    break;
                }
            }
        
            if (!targetClientId) {
                showNotification(`Player "${targetUsername}" not found.`, "error");
                return;
            }
            room.requestPresenceUpdate(targetClientId, { type: 'setNickname', nickname: null });
            showNotification(`Reset ${targetUsername}'s nickname.`, 'success');
            break;
        }
        case 'npc': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }

            const subCommand = args[0]?.toLowerCase();
            if (subCommand === 's') {
                // /npc s (npcname) (name color) (message)
                const npcName = args[1];
                const nameColor = args[2];
                const message = args.slice(3).join(' ');

                if (!npcName || !nameColor || !message) {
                    showNotification("Usage: /npc s (name) (color) (msg)", "error");
                    return;
                }
                
                const playerPos = room.presence[room.clientId];
                if (!playerPos || playerPos.x === undefined) {
                    showNotification("Could not get your current position. Move first.", "error");
                    return;
                }

                const npcId = `npc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                const newNpc = {
                    id: npcId,
                    name: npcName,
                    color: nameColor,
                    message: message,
                    x: playerPos.x,
                    y: playerPos.y,
                    z: playerPos.z,
                    rotation: playerPos.rotation || 0,
                    createdAt: Date.now(),
                    numericId: Math.floor(Date.now() / 1000) % 10000,
                };
                
                const npcs = room.roomState.npcs || {};
                const updatedNpcs = { ...npcs, [npcId]: newNpc };
                room.updateRoomState({ npcs: updatedNpcs });

                showNotification(`NPC "${npcName}" created! (ID: ${newNpc.numericId})`, "success");

            } else if (subCommand === 'remove' || subCommand === 'd') {
                const npcIdToRemoveStr = args[1];
                if (!npcIdToRemoveStr) {
                    showNotification("Usage: /npc remove (ID) or /npc d (ID). Use /npc list to see IDs.", "error");
                    return;
                }

                const numericIdToRemove = parseInt(npcIdToRemoveStr, 10);
                if (isNaN(numericIdToRemove)) {
                    showNotification("Please provide a valid numeric ID. Use /npc list.", "error");
                    return;
                }

                const npcs = room.roomState.npcs || {};
                const npcIdToRemove = Object.keys(npcs).find(id => npcs[id].numericId === numericIdToRemove);

                if (!npcIdToRemove) {
                    showNotification(`NPC with ID "${numericIdToRemove}" not found.`, "error");
                    return;
                }
                
                const npcName = npcs[npcIdToRemove].name;
                const updatedNpcs = { ...npcs };
                delete updatedNpcs[npcIdToRemove];
                room.updateRoomState({ npcs: updatedNpcs });
                showNotification(`NPC "${npcName}" (ID: ${numericIdToRemove}) removed.`, "success");
            
            } else if (subCommand === 'list') {
                const npcs = room.roomState.npcs || {};
                const npcList = Object.values(npcs);

                if (npcList.length === 0) {
                    showNotification("There are no NPCs in the world.", "info");
                    return;
                }

                let messageContent = "NPC List:<br>";
                npcList.forEach(npc => {
                    messageContent += `ID: ${npc.numericId}, Name: ${npc.name}<br>`;
                });
                
                // Show in chat display for visibility
                addChatMessage("System", "Admin", messageContent);
                showNotification("NPC list displayed in chat.", "info");

            } else {
                showNotification("Usage: /npc s (name) (color) (msg) | /npc remove (ID) | /npc list", "error");
            }
            break;
        }
        case 't': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const [color, durationStr] = args;
            const duration = parseInt(durationStr, 10);

            if (!color || isNaN(duration) || duration <= 0) {
                showNotification("Usage: /t (color) (seconds)", "error");
                return;
            }

            const playerPos = room.presence[room.clientId];
            if (!playerPos || playerPos.x === undefined) {
                showNotification("Could not get your current position. Move first.", "error");
                return;
            }

            const timerId = `timer-${Date.now()}`;
            const endTime = Date.now() + duration * 1000;

            const newTimer = {
                id: timerId,
                x: playerPos.x,
                y: playerPos.y + 2.5, // Position it a bit higher
                z: playerPos.z,
                color: color,
                endTime: endTime
            };

            const timers = room.roomState.timers || {};
            const updatedTimers = { ...timers, [timerId]: newTimer };
            room.updateRoomState({ timers: updatedTimers });

            // Set a timeout to remove the timer from room state when it expires
            setTimeout(() => {
                const currentTimers = room.roomState.timers || {};
                const timersAfterRemoval = { ...currentTimers };
                if (timersAfterRemoval[timerId]) {
                    delete timersAfterRemoval[timerId];
                    room.updateRoomState({ timers: timersAfterRemoval });
                }
            }, duration * 1000);

            showNotification(`Timer started for ${duration} seconds.`, "success");
            break;
        }
        case 'fly': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const targetUsername = args[0];

            if (!targetUsername) {
              showNotification(`Please specify a player. Usage: /${command} (playername)`, "error");
              return;
            }
        
            let targetClientId = null;
            for (const clientId in room.peers) {
                if (room.peers[clientId].username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetClientId = clientId;
                    break;
                }
            }
        
            if (!targetClientId) {
                showNotification(`Player "${targetUsername}" not found.`, "error");
                return;
            }
            room.requestPresenceUpdate(targetClientId, { type: 'setFlying', flying: true });
            showNotification(`Flight enabled for ${targetUsername}.`, 'success');
            break;
        }
        case 'unfly': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const targetUsername = args[0];
            if (!targetUsername) {
              showNotification(`Please specify a player. Usage: /${command} (playername)`, "error");
              return;
            }
        
            let targetClientId = null;
            for (const clientId in room.peers) {
                if (room.peers[clientId].username.toLowerCase() === targetUsername.toLowerCase()) {
                    targetClientId = clientId;
                    break;
                }
            }
        
            if (!targetClientId) {
                showNotification(`Player "${targetUsername}" not found.`, "error");
                return;
            }
            room.requestPresenceUpdate(targetClientId, { type: 'setFlying', flying: false });
            showNotification(`Flight disabled for ${targetUsername}.`, 'success');
            break;
        }
        case 'tag': {
            const subCommand = args[0]?.toLowerCase();
            if (subCommand !== 'create' && subCommand !== 'invite') {
                showNotification("Usage: /tag create (name) (color) | /tag invite (playername)", "error");
                return;
            }

            if (subCommand === 'create') {
                const tagNameRaw = args[1];
                const color = args[2] || '#ffffff';

                if (!tagNameRaw || !color) {
                    showNotification("Usage: /tag create (name) (color)", "error");
                    return;
                }

                // Normalize tag name according to tweakables
                let normalizedTag = String(tagNameRaw);
                if (TAG_IGNORE_WHITESPACE) normalizedTag = normalizedTag.replace(/\s+/g, ' ').trim();
                if (TAG_NORMALIZE_TO_LOWERCASE) normalizedTag = normalizedTag.toLowerCase();

                // enforce allowed length
                if (normalizedTag.length < TAG_NAME_MIN || normalizedTag.length > TAG_NAME_MAX) {
                    showNotification(`Tag name must be between ${TAG_NAME_MIN} and ${TAG_NAME_MAX} characters long.`, "error");
                    return;
                }

                // Validate allowed characters (admins may bypass symbols if allowed)
                if (!/^[a-zA-Z0-9 ]+$/.test(tagNameRaw) && !(isAdmin(room?.presence?.[room?.clientId]) && TAG_ALLOW_SYMBOLS_FOR_ADMINS)) {
                    showNotification("Tag name can only contain letters, numbers and spaces. Only admins may include symbols or emojis.", "error");
                    return;
                }

                (async () => {
                    await ensureRoomInitialized();
                    const currentUser = await window.websim.getCurrentUser();
                    if (!currentUser) return;

                    const playerTagsCol = room.collection('player_tags');

                    // Global uniqueness check (case-insensitive / normalized)
                    // Fetch any tags that conflict when normalized the same way
                    const allTags = await playerTagsCol.getList();
                    const conflict = allTags.some(t => {
                        if (!t.tag_name) return false;
                        let existing = String(t.tag_name);
                        if (TAG_IGNORE_WHITESPACE) existing = existing.replace(/\s+/g, ' ').trim();
                        if (TAG_NORMALIZE_TO_LOWERCASE) existing = existing.toLowerCase();
                        return existing === normalizedTag;
                    });

                    if (conflict) {
                        showNotification(`The tag "${tagNameRaw}" is already taken (tags are unique regardless of case or formatting).`, "error");
                        return;
                    }

                    // Create or update the user's tag (primary key is user id, ensuring one tag per player)
                    await playerTagsCol.upsert({
                        id: currentUser.id,
                        tag_name: tagNameRaw, // store original user-provided formatting for display
                        tag_color: color,
                        tag_normalized: normalizedTag // store normalized value for auditing/queries
                    });

                    // Update local presence to show the new tag immediately
                    const newTag = { name: tagNameRaw, color: color };
                    room.updatePresence({ tag: newTag });

                    showNotification(`Tag "${tagNameRaw}" created successfully!`, "success");
                })();
                return;
            }

            // subCommand === 'invite'
            if (subCommand === 'invite') {
                const targetUsername = args[1];
                if (!targetUsername) {
                    showNotification("Usage: /tag invite (playername)", "error");
                    return;
                }

                (async () => {
                    await ensureRoomInitialized();
                    const currentUser = await window.websim.getCurrentUser();
                    if (!currentUser) return;

                    // Get inviter's tag (prefer presence, fallback to DB)
                    const inviterPresence = room.presence[room.clientId] || {};
                    let inviterTag = inviterPresence.tag;
                    if (!inviterTag) {
                        const playerTagsCol = room.collection('player_tags');
                        const myTagList = await playerTagsCol.filter({ id: currentUser.id }).getList();
                        if (myTagList.length > 0) inviterTag = { name: myTagList[0].tag_name, color: myTagList[0].tag_color };
                    }

                    if (!inviterTag || !inviterTag.name) {
                        showNotification("You don't have a tag to invite others to. Create one first with /tag create.", "error");
                        return;
                    }

                    // Find target player clientId
                    const targetEntry = Object.entries(room.peers).find(([id, p]) => p.username.toLowerCase() === targetUsername.toLowerCase());
                    if (!targetEntry) {
                        showNotification(`Player "${targetUsername}" not found or offline.`, "error");
                        return;
                    }
                    const [targetClientId] = targetEntry;
                    const targetUserId = room.peers[targetClientId]?.id || targetClientId;

                    try {
                        const playerTagsCol = room.collection('player_tags');

                        // If auto-accept is enabled, assign immediately
                        if (TAG_INVITE_AUTO_ACCEPT) {
                            await playerTagsCol.upsert({
                                id: targetUserId,
                                tag_name: inviterTag.name,
                                tag_color: inviterTag.color
                            });

                            // Update target presence if they are online (so everyone sees it immediately)
                            room.requestPresenceUpdate(targetClientId, {
                                type: 'setTag',
                                tag: { name: inviterTag.name, color: inviterTag.color }
                            });

                            // Also update local room presence mapping for immediate UI update (if allowed)
                            if (room.presence[targetClientId]) {
                                // best-effort: update room state presence for the target (request to them will ultimately set it)
                                // We avoid directly mutating presence; the requestPresenceUpdate signals them to update
                            }

                            showNotification(`Invited ${targetUsername} and assigned tag [${inviterTag.name}] to them.`, "success");

                            // Broadcast to chat for visibility
                            room.send({
                                type: 'chat',
                                username: currentUser.username,
                                displayName: room.peers[room.clientId]?.username || currentUser.username,
                                rank: room.presence[room.clientId]?.rank || 'default',
                                message: `${targetUsername} has been invited to tag [${inviterTag.name}]`,
                                timestamp: Date.now(),
                                senderId: room.clientId
                            });
                        } else {
                            // In non-auto mode we could create a pending-invite record (not implemented), so inform user
                            showNotification("Invites require approval in this server. The request has been noted.", "info");
                            // Optionally create a lightweight room state request (left as future enhancement)
                        }
                    } catch (err) {
                        console.error('Tag invite failed', err);
                        showNotification("Failed to invite player to tag.", "error");
                    }
                })();
                return;
            }
        }
        case 'stats': {
            const targetUsername = args[0];
            if (!targetUsername) {
                showNotification("Usage: /stats (playername)", "error");
                return;
            }

            const targetPeer = Object.values(room.peers).find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

            if (!targetPeer) {
                showNotification(`Player "${targetUsername}" not found or is offline.`, "error");
                return;
            }

            const targetClientId = targetPeer.id;
            const targetPresence = room.presence[targetClientId];

            if (!targetPresence) {
                showNotification(`Could not retrieve stats for "${targetUsername}".`, "error");
                return;
            }

            const connectedAt = targetPresence.connectedAt || Date.now();
            const onlineDuration = Date.now() - connectedAt;
            const formattedOnlineTime = formatDuration(onlineDuration);

            const rank = targetPresence.rank || 'default';
            const rankData = [...shopRanks, ...staffRanks].find(r => r.name === rank);

            const playerData = {
                username: targetPeer.username,
                avatarUrl: targetPeer.avatarUrl,
                rank: rank,
                rankColor: rankData ? rankData.color : '#ffffff',
                status: 'Online',
                guild: targetPresence.guildName || 'None',
                onlineTime: formattedOnlineTime,
                honor: targetPresence.honor || 0
            };

            showPlayerStats(playerData);
            break;
        }
        case 'gm': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const mode = parseInt(args[0], 10);
            if (isNaN(mode) || mode < 1 || mode > 3) {
                showNotification("Usage: /gm (1 | 2 | 3)", "error");
                return;
            }

            if (mode === 1) { // God mode
                room.updatePresence({ godMode: true, invisible: false });
                showNotification("God mode enabled.", "success");
            } else if (mode === 2) { // Normal mode
                room.updatePresence({ godMode: false, invisible: false });
                showNotification("Gamemode set to normal.", "success");
            } else if (mode === 3) { // Invisibility
                room.updatePresence({ godMode: false, invisible: true });
                showNotification("Invisibility enabled.", "success");
            }
            break;
        }
        case 'staff': {
            if (args[0]?.toLowerCase() === 'edit') {
                if (!isAdmin(localPlayerPresence)) {
                    showNotification("You don't have permission to use this command.", "error");
                    return;
                }

                const editSubCommand = args[1]?.toLowerCase();
                const currentList = room.roomState.staffList || [];
                let newList = JSON.parse(JSON.stringify(currentList)); // Deep copy

                switch(editSubCommand) {
                    case 'add': { // /staff edit add <rank> <name> <color>
                        const rank = args[2];
                        const name = args[3];
                        const color = args[4];
                        if (!rank || !name || !color) {
                            showNotification("Usage: /staff edit add <rank> <name> <color>", "error");
                            return;
                        }
                        newList.push({ rank, name, color });
                        room.updateRoomState({ staffList: newList });
                        showNotification("Staff member added.", "success");
                        break;
                    }
                    case 'remove': { // /staff edit remove <name>
                        const nameToRemove = args[2];
                        if (!nameToRemove) {
                            showNotification("Usage: /staff edit remove <name>", "error");
                            return;
                        }
                        const index = newList.findIndex(s => s.name.toLowerCase() === nameToRemove.toLowerCase());
                        if (index === -1) {
                            showNotification(`Staff member "${nameToRemove}" not found.`, "error");
                            return;
                        }
                        const removed = newList.splice(index, 1);
                        room.updateRoomState({ staffList: newList });
                        showNotification(`Removed ${removed[0].name} from staff list.`, "success");
                        break;
                    }
                    case 'rename': { // /staff edit rename <oldName> <newName>
                        const oldName = args[2];
                        const newName = args[3];
                        if (!oldName || !newName) {
                            showNotification("Usage: /staff edit rename <oldName> <newName>", "error");
                            return;
                        }
                        const staffMember = newList.find(s => s.name.toLowerCase() === oldName.toLowerCase());
                        if (!staffMember) {
                            showNotification(`Staff member "${oldName}" not found.`, "error");
                            return;
                        }
                        staffMember.name = newName;
                        room.updateRoomState({ staffList: newList });
                        showNotification(`Renamed "${oldName}" to "${newName}".`, "success");
                        break;
                    }
                    case 'recolor': { // /staff edit recolor <name> <newColor>
                        const name = args[2];
                        const newColor = args[3];
                        if (!name || !newColor) {
                            showNotification("Usage: /staff edit recolor <name> <newColor>", "error");
                            return;
                        }
                        const staffMember = newList.find(s => s.name.toLowerCase() === name.toLowerCase());
                        if (!staffMember) {
                            showNotification(`Staff member "${name}" not found.`, "error");
                            return;
                        }
                        staffMember.color = newColor;
                        room.updateRoomState({ staffList: newList });
                        showNotification(`Changed color for "${name}" to ${newColor}.`, "success");
                        break;
                    }
                    case 'move': { // /staff edit move <name> <position>
                        const nameToMove = args[2];
                        const newPosition = parseInt(args[3], 10);

                        if (!nameToMove || isNaN(newPosition)) {
                            showNotification("Usage: /staff edit move <name> <position>", "error");
                            return;
                        }
                        
                        const fromIndex = newList.findIndex(s => s.name.toLowerCase() === nameToMove.toLowerCase());
                        if (fromIndex === -1) {
                            showNotification(`Staff member "${nameToMove}" not found.`, "error");
                            return;
                        }
                        
                        // newPosition is 1-based, convert to 0-based index
                        const toIndex = newPosition - 1;

                        if (toIndex < 0 || toIndex >= newList.length) {
                            showNotification(`Invalid position. Must be between 1 and ${newList.length}.`, "error");
                            return;
                        }

                        const [item] = newList.splice(fromIndex, 1);
                        newList.splice(toIndex, 0, item);
                        room.updateRoomState({ staffList: newList });
                        showNotification(`Moved "${nameToMove}" to position ${newPosition}.`, "success");
                        break;
                    }
                    case 'list': {
                         const staffList = room.roomState.staffList || [];
                         if (staffList.length === 0) {
                             showNotification("The staff list is empty.", "info");
                             return;
                         }
                         let listMessage = "Current Staff List:<br>";
                         staffList.forEach((staff, index) => {
                             listMessage += `${index + 1}. <span style="color:${staff.color};">[${staff.rank}] ${staff.name}</span><br>`;
                         });
                         addChatMessage('System', 'Admin', listMessage);
                         showNotification("Staff list displayed in chat.", "info");
                         break;
                    }
                    default: {
                        showNotification("Usage: /staff edit <add|remove|rename|recolor|move|list> ...", "error");
                    }
                }
                return;
            }

            /* @tweakable The header for the staff list */
            const staffListHeader = "=== Server Staff ===";
            /* @tweakable The footer for the staff list */
            const staffListFooter = "====================";
            
            const staffList = room.roomState.staffList || [];
            
            let staffMessage = `${staffListHeader}<br>`;
            
            staffList.forEach(staff => {
                staffMessage += `<span style="color:${staff.color};">[${staff.rank}] ${staff.name}</span><br>`;
            });
            
            staffMessage += staffListFooter;

            // Broadcast to everyone
            room.send({
                type: 'broadcast',
                message: staffMessage,
                senderId: room.clientId
            });

            // Show locally as well
            addChatMessage('System', 'Admin', staffMessage);
            break;
        }
        case 'lb': {
            /* @tweakable The header for the kill leaderboard */
            const lbHeader = "=== Top 5 Kill Leaders ===";
            /* @tweakable The footer for the kill leaderboard */
            const lbFooter = "==========================";
            /* @tweakable The minimum number of kills a player needs to show up on the leaderboard. */
            const minKillsForLeaderboard = 1;

            (async () => {
                try {
                    if (!room) await ensureRoomInitialized();
                    const topPlayers = await room.query(
                        `SELECT username, kills, rank FROM public.player_stats WHERE kills >= ${minKillsForLeaderboard} ORDER BY kills DESC LIMIT 5`
                    );

                    let lbMessage = `${lbHeader}<br>`;

                    if (topPlayers.length === 0) {
                        lbMessage += "No kills recorded yet.<br>";
                    } else {
                        topPlayers.forEach((player, index) => {
                            const rankData = [...shopRanks, ...staffRanks].find(r => r.name === player.rank) || { color: '#ffffff' };
                            const rankColor = rankData.color;
                            lbMessage += `${index + 1}. <span style="color:${rankColor};">[${player.rank || 'default'}] ${player.username}</span> - ${player.kills} kills<br>`;
                        });
                    }

                    lbMessage += lbFooter;

                    // Broadcast to everyone
                    room.send({
                        type: 'broadcast',
                        message: lbMessage,
                        senderId: room.clientId
                    });
                    
                    // Show locally
                    addChatMessage('System', 'Admin', lbMessage);

                } catch (error) {
                    console.error("Error fetching leaderboard:", error);
                    showNotification("Could not fetch the leaderboard.", "error");
                }
            })();
            break;
        }
        case 'leaderboard': {
            updateScoreboard();
            showNotification("Leaderboard updated!", "info");
            break;
        }
        case 'view': {
            const targetUsername = args[0];
            if (!targetUsername) {
                showNotification("Usage: /view (playername)", "error");
                return;
            }

            (async () => {
                try {
                    if (!room) await ensureRoomInitialized();
                    const statsCol = room.collection('player_stats');
                    
                    // Query for the player's stats
                    const statsList = await statsCol.filter({ username: targetUsername }).getList();
                    
                    if (statsList.length === 0) {
                        showNotification(`Player "${targetUsername}" not found or has no recorded stats.`, "error");
                        return;
                    }

                    const stats = statsList[0];
                    const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                    
                    // Format the stats message with colors
                    let statsMessage = `=== Player Stats: ${targetUsername} ===<br>`;
                    statsMessage += `<span style="color: #4ade80;">Kills:</span> ${stats.kills}<br>`;
                    statsMessage += `<span style="color: #f87171;">Deaths:</span> ${stats.deaths}<br>`;
                    statsMessage += `<span style="color: #fbbf24;">K/D Ratio:</span> ${kd}<br>`;
                    statsMessage += `<span style="color: #60a5fa;">Highest Kill Streak:</span> ${stats.highest_kill_streak || 0}<br>`;
                    statsMessage += `<span style="color: #a78bfa;">Rank:</span> ${stats.rank || DEFAULT_RANK}`;
                    
                    // Broadcast to everyone
                    room.send({
                        type: 'broadcast',
                        message: statsMessage,
                        senderId: room.clientId
                    });
                    
                    // Show locally
                    addChatMessage('System', 'Stats', statsMessage);
                    
                } catch (error) {
                    console.error("Error fetching player stats:", error);
                    showNotification("Could not fetch player stats.", "error");
                }
            })();
            break;
        }
        case 'r': {
            if (!isAdmin(localPlayerPresence)) {
                showNotification("You don't have permission to use this command.", "error");
                return;
            }
            const targetUsername = args[0];
            const messageText = args.slice(1).join(' ');
            if (!targetUsername || !messageText) {
                showNotification("Usage: /r (playername) (message)", "error");
                return;
            }

            // Send the message using the specified player's name
            room.send({
                type: 'chat',
                username: targetUsername,
                displayName: targetUsername,
                rank: 'default',
                message: messageText,
                timestamp: Date.now(),
                senderId: room.clientId
            });

            // Show confirmation to the admin
            showNotification(`Sent message as ${targetUsername}`, 'success');
            break;
        }
        case 'setowner': {
          const allowed = ['Owner', 'SrDev', 'Dev', 'Admin'];
          if (!allowed.includes(localPlayerRank)) {
            showNotification("You don't have permission to use this command.", "error");
            return;
          }
          const targetUsername = args[0];
          if (!targetUsername) {
            showNotification('Usage: /setowner (playername)', 'error');
            return;
          }
          // Find target clientId and stable user id
          const targetPeerEntry = Object.entries(room.peers).find(([id, p]) => p.username.toLowerCase() === targetUsername.toLowerCase());
          if (!targetPeerEntry) {
            showNotification(`Player "${targetUsername}" not found.`, 'error');
            return;
          }
          const [targetClientId] = targetPeerEntry;
          const targetUserId = room.peers[targetClientId]?.id || targetClientId;
          // Update room state userRanks and serverOwner persistently
          const ownerRank = staffRanks.find(r => r.name === 'Owner');
          const userRanks = room.roomState.userRanks || {};
          userRanks[targetUserId] = { rank: ownerRank.name, color: ownerRank.color, icon: ownerRank.icon, assignedBy: room.clientId, assignedAt: Date.now() };
          room.updateRoomState({ userRanks, serverOwner: targetUserId });
          // Notify and confirm
          showNotification(`${targetUsername} has been assigned as server owner.`, 'success');
          room.send({ type: 'chat', username: 'System', displayName: 'System', rank: 'default', message: `${targetUsername} is now the server owner.`, timestamp: Date.now(), senderId: room.clientId });
          break;
        }
        case 'announce': {
          if (!isAdmin(localPlayerPresence)) { showNotification("You don't have permission.", "error"); return; }
          if (args[0]?.toLowerCase() === 'remove') {
            room.collection('announcement_events').create({ removed: true, message: '', color: '' });
            showNotification("Announcement removed.", "success");
            break;
          }
          if (args.length < 2) { showNotification("Usage: /announce (message) (color)", "error"); return; }
          const color = args[args.length - 1];
          const msg = args.slice(0, -1).join(' ');
          room.collection('announcement_events').create({ message: msg, color, removed: false });
          showNotification("Announcement updated.", "success");
          break;
        }
        case 'adminpassword': {
          const pass = args[0];
          if (!pass) { showNotification("Usage: /adminpassword (password)", "error"); break; }
          if (pass === ADMIN_PASSWORD) {
            room.updatePresence({ isTempAdmin: true });
            showNotification("Temporary admin granted for this session.", "success");
          } else {
            showNotification("Invalid admin password.", "error");
          }
          break;
        }
        case 'shutdown': {
          if (!isAdmin(localPlayerPresence)) { showNotification("You don't have permission.", "error"); break; }
          const seconds = parseInt(args[0], 10);
          const msg = args.slice(1).join(' ') || 'Server is shutting down...';
          if (isNaN(seconds) || seconds < 0) { showNotification("Usage: /shutdown (seconds) (message)", "error"); break; }
          
          room.collection('admin_events').create({
            type: 'shutdown',
            seconds,
            message: msg,
            active: true,
            scheduled_at: new Date().toISOString()
          });
          showNotification("Shutdown scheduled.", "success");
          break;
        }
        case 'macro': {
          if (!isAdmin(localPlayerPresence)) { showNotification("You don't have permission.", "error"); break; }
          const name = args[0];
          if (!name || !MACROS[name]) { showNotification("Unknown macro. Usage: /macro (name)", "error"); break; }
          
          room.collection('admin_events').create({
            type: 'macro',
            macro: name,
            message: `Macro ${name} executed`,
            active: true,
            scheduled_at: new Date().toISOString()
          });
          showNotification(`Macro "${name}" dispatched.`, 'success');
          break;
        }
        case 'skill': {
            if (args[0]?.toLowerCase() === 'use') {
                handleUseSkill();
            } else {
                showNotification('Usage: /skill use', 'info');
            }
            break;
        }
        default:
            showNotification(`Unknown command: "${command}"`, "error");
    }
  }
  
  // Add function to create rank displays
  function createPlayerRankDisplay(playerId, displayName, rank) {
    const display = document.createElement('div');
    display.className = 'player-rank-display';
    display.id = `rank-${playerId}`;
    
    const rankData = getRankData(rank);
    display.style.color = rankData?.color || '#ffffff';
    
    // Add main content
    if (rankData && rankData.format) {
        display.innerHTML = parseMinecraftCodes(rankData.format.replace('{username}', displayName));
        if (rank === 'Mythic') {
          display.querySelector('.minecraft-text')?.classList.add('mythic-glow');
          display.classList.add('mythic-full-glow');
          // Expose tweakable values as inline CSS variables for the stylesheet to use
          display.style.setProperty('--mythic-glow-color', MYTHIC_GLOW_COLOR);
          display.style.setProperty('--mythic-glow-blur', `${MYTHIC_GLOW_BLUR}px`);
          display.style.setProperty('--mythic-glow-spread', `${MYTHIC_GLOW_SPREAD}`);
          // Add our new animated mythical class and set variables for CSS animation
          display.classList.add('mythical-name');
          display.style.setProperty('--mythic-duration', MYTHIC_RB_ANIM_DURATION + 's');
          display.style.setProperty('--mythic-red', MYTHIC_RB_RED);
          display.style.setProperty('--mythic-blue', MYTHIC_RB_BLUE);
          display.style.setProperty('--mythic-glow-size', MYTHIC_RB_GLOW_SIZE);
        }
    } else {
        const iconHtml = getRankIconHtml(rank);
        display.innerHTML = `${rank || 'player'}|${displayName} ${iconHtml}`;
        if (rank === 'Mythic') {
          // Apply animated style for plain-format fallback
          display.classList.add('mythical-name');
          display.style.setProperty('--mythic-duration', MYTHIC_RB_ANIM_DURATION + 's');
          display.style.setProperty('--mythic-red', MYTHIC_RB_RED);
          display.style.setProperty('--mythic-blue', MYTHIC_RB_BLUE);
          display.style.setProperty('--mythic-glow-size', MYTHIC_RB_GLOW_SIZE);
        }
    }

    // Add honor HUD element (live updated)
    /* @tweakable The class used for the honor display element (can be targeted in CSS) */
    const HONOR_DISPLAY_CLASS = 'player-honor-display';
    /* @tweakable The default text shown while honor is loading */
    const HONOR_LOADING_TEXT = '❤ ...';

    const honorWrap = document.createElement('div');
    honorWrap.className = HONOR_DISPLAY_CLASS;
    honorWrap.style.marginTop = '4px';
    honorWrap.style.fontSize = '0.9rem';
    honorWrap.style.fontWeight = '800';
    honorWrap.style.color = '#ffd166';
    honorWrap.textContent = HONOR_LOADING_TEXT;
    honorWrap.dataset.userId = playerId; // store for updates

    display.appendChild(honorWrap);

    document.getElementById('chat-and-npc-container').appendChild(display);
    return display;
  }
  
  // Create chat message element for local player
  chatMessages[room.clientId] = createChatMessage(room.clientId);

  // Helper to set/update a tag on a label
  function setOrUpdateTag(displayEl, tag) {
    if (!displayEl) return;
    const existing = displayEl.querySelector('.player-tag');
    if (existing) existing.remove();
    if (tag && tag.name) {
      const span = document.createElement('span');
      span.className = 'player-tag';
      // store just the raw tag name; CSS will render brackets
      span.textContent = tag.name;
      if (tag.color) span.style.color = tag.color;
      displayEl.appendChild(span);
    }
  }

  function getRankIconHtml(rank) {
      const rankIcons = {
          'Owner': 'owner-rank-icon', 'Admin': 'admin-rank-icon', 'Support': 'supporter-rank-icon',
          'Media': 'media-rank-icon', 'Content': 'content-rank-icon', 'Lapis': 'lapis-rank-icon',
          'Gold': 'gold-rank-icon', 'Diamond': 'diamond-rank-icon', 'Emerald': 'emerald-rank-icon',
          'Netherite': 'netherite-rank-icon', 'Amethyst': 'amethyst-rank-icon', 'Bedrock': 'bedrock-rank-icon',
          'Twitch': 'twitch-rank-icon', 'Sponsor': 'sponsor-rank-icon', 'TrialMod': 'trialmod-rank-icon',
          'Moderator': 'moderator-rank-icon', 'SrMod': 'srmod-rank-icon', 'SrDev': 'srdev-rank-icon', 'Dev': 'dev-rank-icon',
          'YouTube': 'youtube-rank-icon'
      };
      const iconClass = rankIcons[rank];
      return iconClass ? `<span class="${iconClass}"></span>` : '';
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    playerControls.update();
    gun.update(otherPlayers);

    if (isFiring) {
        gun.fire();
    }
    
    const maxVisibleDistance = 25; // Set a maximum distance for labels to be visible
    const now = performance.now();

    // Update name labels and chat messages for all players
    for (const clientId in otherPlayers) {
      const otherPlayerModel = otherPlayers[clientId];
      const playerLabel = playerLabels[clientId];
      const guildLabel = guildLabels[clientId];
      const chatMessage = chatMessages[clientId];

      // Handle invisibility
      const playerPresence = room.presence[clientId];
      if (playerPresence && playerPresence.invisible) {
          otherPlayerModel.visible = false;
          if (playerLabel) playerLabel.style.display = 'none';
          if (guildLabel) guildLabel.style.display = 'none';
          if (chatMessage) chatMessage.style.display = 'none';
          continue; // Skip rendering for invisible players
      } else if (otherPlayerModel) {
          otherPlayerModel.visible = true; // Ensure visible otherwise
      }

      if (playerLabel && otherPlayerModel) {
        const distance = playerModel.position.distanceTo(otherPlayerModel.position);

        if (distance > maxVisibleDistance) {
          playerLabel.style.display = 'none';
          if (guildLabel) guildLabel.style.display = 'none';
          if (chatMessage) chatMessage.style.display = 'none';
          continue; // Skip players that are too far away
        }

        const screenPosition = getScreenPosition(otherPlayerModel.position, camera, renderer);
        if (screenPosition) {
          playerLabel.style.left = `${screenPosition.x}px`;
          playerLabel.style.top = `${screenPosition.y - 45}px`;
          playerLabel.style.display = screenPosition.visible ? 'flex' : 'none';

          if (guildLabel) {
            guildLabel.style.left = `${screenPosition.x}px`;
            guildLabel.style.top = `${screenPosition.y - 65}px`;
            guildLabel.style.display = screenPosition.visible && guildLabel.textContent ? 'block' : 'none';
          }
          
          if (chatMessage) {
            chatMessage.style.left = `${screenPosition.x}px`;
            chatMessage.style.top = `${screenPosition.y - 85}px`;
            
            // Only show if visible, has content, and hasn't timed out
            const messageTimestamp = chatMessage.dataset.timestamp || 0;
            if (screenPosition.visible && now - messageTimestamp < 5000) {
              chatMessage.style.display = 'flex';
            } else {
              chatMessage.style.display = 'none';
            }
          }
        } else {
          playerLabel.style.display = 'none';
          if (guildLabel) guildLabel.style.display = 'none';
          if (chatMessage) chatMessage.style.display = 'none';
        }
      }
    }
    
    // Update Timers
    const currentTime = Date.now();
    const timersState = (room && room.roomState && room.roomState.timers) ? room.roomState.timers : {};
    for (const timerId in timerElements) {
        const timerEl = timerElements[timerId];
        const timerData = timersState[timerId];
 
        if (timerData) {
            const timeLeft = Math.max(0, Math.ceil((timerData.endTime - currentTime) / 1000));
            timerEl.textContent = formatTime(timeLeft);

            const distance = playerModel.position.distanceTo(new THREE.Vector3(timerData.x, timerData.y, timerData.z));
            if (distance > maxVisibleDistance) {
                timerEl.style.display = 'none';
                continue;
            }
            
            const screenPosition = getScreenPosition({ x: timerData.x, y: timerData.y, z: timerData.z }, camera, renderer);
            if (screenPosition) {
                timerEl.style.left = `${screenPosition.x}px`;
                timerEl.style.top = `${screenPosition.y}px`;
                timerEl.style.display = screenPosition.visible ? 'block' : 'none';
            } else {
                timerEl.style.display = 'none';
            }
        }
    }

    // Update NPC models and labels
    const time = performance.now();
    for (const npcId in npcObjects) {
        const npcModel = npcObjects[npcId];
        const npcData = room.roomState.npcs[npcId];

        if (npcModel && npcData) {
            // Apply jumping animation
            const jumpFrequency = 0.002;
            const jumpHeight = 0.5;
            // Use npcId to vary the jump phase
            const phase = parseInt(npcId.replace(/[^0-9]/g, '').slice(-5)) || 0;
            npcModel.position.y = npcData.y + Math.abs(Math.sin(time * jumpFrequency + phase)) * jumpHeight;

            const nameLabel = npcLabels[npcId];
            const messageLabel = npcMessages[npcId];
            const distance = playerModel.position.distanceTo(npcModel.position);

            if (distance > maxVisibleDistance) {
                if (nameLabel) nameLabel.style.display = 'none';
                if (messageLabel) messageLabel.style.display = 'none';
                continue;
            }

            // Update label positions
            const screenPosition = getScreenPosition(npcModel.position, camera, renderer);
            if (screenPosition) {
                if (nameLabel) {
                    nameLabel.style.left = `${screenPosition.x}px`;
                    nameLabel.style.top = `${screenPosition.y - 45}px`;
                    nameLabel.style.display = screenPosition.visible ? 'block' : 'none';
                }
                if (messageLabel) {
                    messageLabel.style.left = `${screenPosition.x}px`;
                    messageLabel.style.top = `${screenPosition.y - 65}px`;
                    messageLabel.style.display = screenPosition.visible ? 'block' : 'none';
                }
            } else {
                if (nameLabel) nameLabel.style.display = 'none';
                if (messageLabel) messageLabel.style.display = 'none';
            }
        }
    }

    // Update local player's chat message position
    const localChatMessage = chatMessages[room.clientId];
    if (localChatMessage && playerModel) {
      const screenPosition = getScreenPosition(playerModel.position, camera, renderer);
      if (screenPosition) {
        // Position labels for local player
        if(playerLabels[room.clientId]) {
            playerLabels[room.clientId].style.left = `${screenPosition.x}px`;
            playerLabels[room.clientId].style.top = `${screenPosition.y - 45}px`;
        }
        if (guildLabels[room.clientId]) {
          guildLabels[room.clientId].style.left = `${screenPosition.x}px`;
          guildLabels[room.clientId].style.top = `${screenPosition.y - 65}px`;
        }
        
        localChatMessage.style.left = `${screenPosition.x}px`;
        localChatMessage.style.top = `${screenPosition.y - 85}px`;

        const messageTimestamp = localChatMessage.dataset.timestamp || 0;
        if (screenPosition.visible && now - messageTimestamp < 5000) {
            localChatMessage.style.display = 'flex';
        } else {
            localChatMessage.style.display = 'none';
        }
      } else {
        localChatMessage.style.display = 'none';
      }
    }
    
    // After updating display content, apply tag and honor HUD
    const myPresence = room && room.presence ? room.presence[room.clientId] : null;
    if (myPresence) {
      setOrUpdateTag(playerLabels[room.clientId], myPresence.tag);
      
      // Update honor HUD from room state honor map (use stable user id)
      (async () => {
        try {
          const peer = room.peers[room.clientId] || {};
          const userId = peer.id || room.clientId;
          const honorValue = await getHonorForUser(userId);
          const label = playerLabels[room.clientId];
          if (label) {
            const honorEl = label.querySelector('.player-honor-display');
            if (honorEl) honorEl.textContent = '❤ ' + honorValue;
          }
        } catch (e) {
          console.warn('Failed updating honor HUD', e);
        }
      })();
    }
    
    renderer.render(scene, camera);
  }
  
  function formatTime(totalSeconds) {
    if (totalSeconds <= 0) {
        return "0s";
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0) {
        parts.push(`${minutes}m`);
    }
    if (seconds > 0 || (hours === 0 && minutes === 0)) {
        parts.push(`${seconds}s`);
    }

    return parts.join(' ');
  }

  // Helper function to convert 3D position to screen coordinates
  function getScreenPosition(position, camera, renderer) {
    const vector = new THREE.Vector3();
    const widthHalf = renderer.domElement.width / 2;
    const heightHalf = renderer.domElement.height / 2;
    
    // Get the position adjusted to account for player height
    vector.copy(position);
    vector.y += 1.5; // Position above the player's head
    
    // Project to screen space
    vector.project(camera);
    
    // Calculate whether object is in front of the camera
    const isInFront = vector.z < 1;
    
    // Convert to screen coordinates
    return {
      x: (vector.x * widthHalf) + widthHalf,
      y: -(vector.y * heightHalf) + heightHalf,
      visible: isInFront
    };
  }

  // Load and subscribe to persistent announcements
  const annCol = room.collection('announcement_events');
  const applyLatest = (events) => {
    const latest = (events || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (latest && !latest.removed) setAnnouncement(latest.message, latest.color);
    else setAnnouncement('', '');
  };
  annCol.subscribe(applyLatest);
  annCol.getList().then(applyLatest);

  // Subscribe to admin events (shutdown + macros)
  const adminCol = room.collection('admin_events');
  const applyAdmin = (events) => handleAdminEvents(events, playerControls);
  adminCol.subscribe(applyAdmin);
  adminCol.getList().then(applyAdmin);

  // Subscribe to room state for NPCs
  room.subscribeRoomState((state) => {
    const npcs = state.npcs || {};
    const timers = state.timers || {};

    // Add or update Timers
    for (const timerId in timers) {
        if (!timerElements[timerId]) {
            const timerData = timers[timerId];
            const timerEl = document.createElement('div');
            timerEl.className = 'game-timer';
            timerEl.style.color = timerData.color;
            document.getElementById('game-timers-container').appendChild(timerEl);
            timerElements[timerId] = timerEl;
        }
    }

    // Remove expired/deleted timers
    for (const timerId in timerElements) {
        if (!timers[timerId]) {
            if (timerElements[timerId]?.parentNode) {
                timerElements[timerId].parentNode.removeChild(timerElements[timerId]);
            }
            delete timerElements[timerId];
        }
    }

    // Add or update NPCs
    for (const npcId in npcs) {
        const npcData = npcs[npcId];
        if (!npcObjects[npcId]) {
            // Create NPC model
            const npcModel = createPlayerModel(THREE, npcData.name);
            npcModel.position.set(npcData.x, npcData.y, npcData.z);
            npcModel.rotation.y = npcData.rotation;
            scene.add(npcModel);
            npcObjects[npcId] = npcModel;

            // Create name label
            const nameLabel = document.createElement('div');
            nameLabel.className = 'npc-name';
            nameLabel.textContent = npcData.name;
            nameLabel.style.color = npcData.color;
            document.getElementById('chat-and-npc-container').appendChild(nameLabel);
            npcLabels[npcId] = nameLabel;

            // Create message label
            const messageLabel = document.createElement('div');
            messageLabel.className = 'npc-message';
            messageLabel.textContent = npcData.message;
            document.getElementById('npc-message-container').appendChild(messageLabel);
            npcMessages[npcId] = messageLabel;
        } else {
            // Update existing NPC data if needed (e.g., if we add a /movenpc command later)
            const npcModel = npcObjects[npcId];
            npcModel.position.x = npcData.x;
            // Note: We don't update Y here to allow the jump animation to control it
            npcModel.position.z = npcData.z;
            npcModel.rotation.y = npcData.rotation;
        }
    }

    // Remove deleted NPCs
    for (const npcId in npcObjects) {
        if (!npcs[npcId]) {
            scene.remove(npcObjects[npcId]);
            delete npcObjects[npcId];

            if (npcLabels[npcId]?.parentNode) {
                npcLabels[npcId].parentNode.removeChild(npcLabels[npcId]);
            }
            delete npcLabels[npcId];

            if (npcMessages[npcId]?.parentNode) {
                npcMessages[npcId].parentNode.removeChild(npcMessages[npcId]);
            }
            delete npcMessages[npcId];
        }
    }
  });

  // Update the presence subscription to use nicknames
  room.subscribePresence((presence) => {
    for (const clientId in presence) {
      if (!presence[clientId]) continue;
      
      const peerInfo = room.peers[clientId] || {};
      const peerName = peerInfo.username || `Player${clientId.substring(0, 4)}`;
      const peerId = peerInfo.id || clientId; // Use stable user ID
      
      // Check both saved rank and current presence for rank data
      const userRanks = room.roomState.userRanks || {};
      const savedRank = userRanks[peerId];
      
      let rank = 'default';
      let color = '#ffffff';
      let icon = '';
      
      // Prioritize saved rank over presence rank
      if (savedRank) {
        rank = savedRank.rank;
        color = savedRank.color;
        icon = savedRank.icon;
      } else if (presence[clientId].rank) {
        rank = presence[clientId].rank;
        color = presence[clientId].color;
        icon = presence[clientId].icon;
      }
      
      const honor = presence[clientId].honor ?? 0;

      // Use nickname if available, otherwise use username
      const displayName = presence[clientId].nickname || peerName;
      const guildName = presence[clientId].guildName;
      
      // Update the display with icon or image
      if (!playerLabels[clientId]) {
        playerLabels[clientId] = createPlayerRankDisplay(clientId, displayName, rank);
      } else {
        const display = playerLabels[clientId];
        const rankData = getRankData(rank);
        
        if (rankData && rankData.format) {
            display.innerHTML = parseMinecraftCodes(rankData.format.replace('{username}', displayName));
            if (rank === 'Mythic') {
              display.querySelector('.minecraft-text')?.classList.add('mythic-glow');
              display.classList.add('mythical-name');
              display.style.setProperty('--mythic-duration', MYTHIC_RB_ANIM_DURATION + 's');
              display.style.setProperty('--mythic-red', MYTHIC_RB_RED);
              display.style.setProperty('--mythic-blue', MYTHIC_RB_BLUE);
              display.style.setProperty('--mythic-glow-size', MYTHIC_RB_GLOW_SIZE);
            }
        } else {
            display.style.color = rankData?.color || '#ffffff';
            display.innerHTML = `${rank || 'player'}|${displayName} ${getRankIconHtml(rank)}`;
            if (rank === 'Mythic') {
              display.classList.add('mythical-name');
              display.style.setProperty('--mythic-duration', MYTHIC_RB_ANIM_DURATION + 's');
              display.style.setProperty('--mythic-red', MYTHIC_RB_RED);
              display.style.setProperty('--mythic-blue', MYTHIC_RB_BLUE);
              display.style.setProperty('--mythic-glow-size', MYTHIC_RB_GLOW_SIZE);
            }
        }
      }
      
      // After updating display content, apply tag and honor HUD
      setOrUpdateTag(playerLabels[clientId], presence[clientId].tag);
      
      // Ensure the honor display is created/updated for this label (show below name for everyone)
      if (playerLabels[clientId]) {
        setOrUpdateHonorDisplay(playerLabels[clientId], clientId);
      }
      
      // Create new player if needed
      if (!otherPlayers[clientId] && presence[clientId].x !== undefined && presence[clientId].z !== undefined) {
        const playerModel = createPlayerModel(THREE, peerName);
        playerModel.position.set(presence[clientId].x, presence[clientId].y || 0.5, presence[clientId].z);
        if (presence[clientId].rotation !== undefined) {
          playerModel.rotation.y = presence[clientId].rotation;
        }

        // Handle invisibility on creation
        playerModel.visible = !presence[clientId].invisible;

        scene.add(playerModel);
        otherPlayers[clientId] = playerModel;
        
        // Create chat message element
        chatMessages[clientId] = createChatMessage(clientId);
        
        // Create guild label
        if (presence[clientId].guildName) {
          guildLabels[clientId] = createPlayerGuildLabel(clientId);
        }
      }
      
      // Update existing player
      else if (otherPlayers[clientId] && presence[clientId].x !== undefined && presence[clientId].z !== undefined) {
        otherPlayers[clientId].position.set(presence[clientId].x, presence[clientId].y || 0, presence[clientId].z);
        if (presence[clientId].rotation !== undefined) {
          otherPlayers[clientId].rotation.y = presence[clientId].rotation;
        }

        // Handle invisibility on update
        otherPlayers[clientId].visible = !presence[clientId].invisible;
        
        // Animate legs if moving
        if (presence[clientId].moving) {
          const leftLeg = otherPlayers[clientId].getObjectByName("leftLeg");
          const rightLeg = otherPlayers[clientId].getObjectByName("rightLeg");
          
          if (leftLeg && rightLeg) {
            const walkSpeed = 5;
            const walkAmplitude = 0.3;
            const animationPhase = performance.now() * 0.01 * walkSpeed;
            leftLeg.rotation.x = Math.sin(animationPhase) * walkAmplitude;
            rightLeg.rotation.x = Math.sin(animationPhase + Math.PI) * walkAmplitude;
          }
        } else {
          // Reset legs when standing still
          const leftLeg = otherPlayers[clientId].getObjectByName("leftLeg");
          const rightLeg = otherPlayers[clientId].getObjectByName("rightLeg");
          if (leftLeg && rightLeg) {
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
          }
        }
        
        // Update chat message if present
        if (presence[clientId].chat && presence[clientId].chat.message) {
          const messageEl = chatMessages[clientId];
          messageEl.textContent = presence[clientId].chat.message;
          messageEl.dataset.timestamp = presence[clientId].chat.timestamp;
        }
      }
    }
    
    // After processing presence updates, refresh the public leaderboard UI
    updateScoreboard();
  });

  // After scene setup
  createChatDisplay();
  
  // Start skill UI updates
  setInterval(updateSkillUI, 1000);
  
  animate();
}

function closeShop() {
  const overlay = document.querySelector('.shop-overlay');
  if (overlay) {
    overlay.classList.add('menu-fade-out');
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 300);
  }
}

// ---- SKILL SYSTEM FUNCTIONS ----

/* @tweakable The kill streak milestones that trigger announcements */
const KILL_STREAK_MILESTONES = [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

/* @tweakable The minimum kill streak that triggers a broadcast (3) */
const MIN_KILL_STREAK = 3;
/* @tweakable The interval for broadcasting kill streaks after the minimum (every 5 kills) */
const KILL_STREAK_INTERVAL = 5;

function startCooldown(skillId, durationSeconds) {
    const expiration = Date.now() + durationSeconds * 1000;
    localStorage.setItem(`skill_cooldown_${skillId}`, expiration);
    updateSkillUI();
}

function getCooldownLeft(skillId) {
    const expiration = localStorage.getItem(`skill_cooldown_${skillId}`);
    if (!expiration) return 0;
    const timeLeft = parseInt(expiration, 10) - Date.now();
    return Math.max(0, timeLeft);
}

function updateSkillUI() {
    if (!room || !room.presence || !room.clientId) return;
    const playerPresence = room.presence[room.clientId];
    const rank = playerPresence?.rank || 'default';
    const skill = SKILL_DEFINITIONS[rank];
    const skillUI = document.getElementById('skill-ui');
    
    if (!skill || !skillUI) {
        if (skillUI) skillUI.style.display = 'none';
        return;
    }

    skillUI.style.display = 'block';
    const cooldownLeft = getCooldownLeft(skill.id);
    
    if (cooldownLeft > 0) {
        skillUI.className = 'cooldown';
        skillUI.innerHTML = `${skill.name} Cooldown: ${formatDuration(cooldownLeft)}`;
    } else {
        skillUI.className = 'ready';
        // Avoid re-creating the button if it already exists
        if (!skillUI.querySelector('#skill-button')) {
          skillUI.innerHTML = '';
          const skillButton = document.createElement('button');
          skillButton.id = 'skill-button';
          skillButton.textContent = `Use ${skill.name}`;
          skillButton.onclick = handleUseSkill;
          skillUI.appendChild(skillButton);
        }
    }
}

function handleUseSkill() {
    if (!playerControls) return; // Guard against playerControls not being initialized
    const playerPresence = room.presence[room.clientId];
    const rank = playerPresence?.rank || 'default';
    const skill = SKILL_DEFINITIONS[rank];

    if (!skill) {
        showNotification('Your rank does not have a skill.', 'info');
        return;
    }

    const cooldownLeft = getCooldownLeft(skill.id);
    if (cooldownLeft > 0) {
        showNotification(`Skill on cooldown. Time left: ${formatDuration(cooldownLeft)}`, 'error');
        return;
    }

    activateSkill(skill);
}

function activateSkill(skill) {
    showNotification(`${skill.name} activated!`, 'success');
    startCooldown(skill.id, skill.cooldown);

    skill.effects.forEach(effect => {
        switch (effect.type) {
            case 'heal':
                activateHeal(effect.duration, effect.amountPerSecond);
                break;
            case 'speed':
                activateSpeed(effect.duration, effect.multiplier);
                break;
            case 'fly':
                activateFly(effect.duration);
                break;
            case 'invisible':
                activateInvisibility(effect.duration);
                break;
        }
    });
}

function activateHeal(duration, amountPerSecond) {
    const healInterval = setInterval(() => {
        const currentHealth = room.presence[room.clientId]?.health || 0;
        const newHealth = Math.min(100, currentHealth + amountPerSecond);
        room.updatePresence({ health: newHealth });
        updateHealthBar(newHealth);
        if (newHealth >= 100) {
            clearInterval(healInterval);
        }
    }, 1000);

    setTimeout(() => {
        clearInterval(healInterval);
    }, duration * 1000);
}

function activateSpeed(duration, multiplier) {
    if (playerControls) {
        playerControls.setSpeedMultiplier(multiplier);
        setTimeout(() => {
            playerControls.setSpeedMultiplier(1);
        }, duration * 1000);
    }
}

function activateFly(duration) {
    if (playerControls) {
        playerControls.setFlying(true);
        setTimeout(() => {
            playerControls.setFlying(false);
        }, duration * 1000);
    }
}

function activateInvisibility(duration) {
    room.updatePresence({ invisible: true });
    setTimeout(() => {
        room.updatePresence({ invisible: false });
    }, duration * 1000);
}

// Function to display player stats panel
function showPlayerStats(playerData) {
    // Remove any existing stats overlay
    const existingOverlay = document.querySelector('.stats-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'stats-overlay';

    const container = document.createElement('div');
    container.className = 'stats-container';

    const avatarSrc = playerData.avatarUrl || `https://images.websim.com/avatar/${playerData.username}`;
    let honorValue = 'Loading...';
    // Fetch honor and include in UI (async)
    (async () => {
      try {
        const targetUserId = playerData.userId || playerData.username;
        honorValue = await getHonorForUser(targetUserId);
      } catch (e) {
        console.error('Error fetching honor', e);
        honorValue = 'N/A';
      }
      const honorEl = container.querySelector('.stats-honor-value');
      if (honorEl) honorEl.textContent = honorValue;
    })();
    container.innerHTML = `
        <div class="stats-header">
            <img src="${avatarSrc}" class="stats-avatar" alt="${playerData.username}'s avatar">
            <h2 class="stats-title">${playerData.username}</h2>
            <div class="stats-close">&times;</div>
        </div>
        <div class="stats-grid">
            <div class="stats-item"><span class="stats-label">Rank</span>
              <span class="stats-value" style="color: ${playerData.rankColor};">${playerData.rank}</span></div>
            <div class="stats-item"><span class="stats-label">Status</span>
              <span class="stats-value" style="color: #4ade80;">${playerData.status}</span></div>
            <div class="stats-item"><span class="stats-label">Guild</span>
              <span class="stats-value">${playerData.guild}</span></div>
            <div class="stats-item"><span class="stats-label">Session Time</span>
              <span class="stats-value">${playerData.onlineTime}</span></div>
        </div>
    `;

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.stats-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            close();
        }
    });
}

// Update purchaseRank function to use tip system
async function purchaseRank(rank) {
  if (!room) {
    await ensureRoomInitialized();
  }
  
  const clientId = room.clientId;
  
  // Check if user already has this rank
  const userRanks = room.roomState.userRanks || {};
  const userId = room.peers[clientId]?.id || clientId;
  const currentRank = userRanks[userId]?.rank || 'default';
  
  if (currentRank === rank.name) {
    showNotification(`You already have the ${rank.name} rank!`, 'info');
    return;
  }

  // Enforce code requirement unless direct purchases are explicitly allowed
  if (REQUIRE_CODE_FOR_RANK_PURCHASE && !ALLOW_DIRECT_RANK_PURCHASE) {
    // Always prompt for code for every rank purchase (secret or not)
    const code = prompt(RANK_CODE_PROMPT_MESSAGE);
    if (!code) {
      showNotification('Purchase cancelled.', 'error');
      return;
    }
    if (code.toLowerCase().trim() !== (rank.secretCode || '').toLowerCase()) {
      showNotification('Invalid purchase code.', 'error');
      return;
    }
    // Valid code -> grant rank
    await saveUserRank(rank);
    room.updatePresence({
      rank: rank.name,
      color: rank.color,
      icon: rank.icon
    });
    showNotification(`Successfully unlocked ${rank.name}!`, 'success');
    return;
  }

  // If codes are not required globally but rank has a secretCode, disallow direct purchase
  if (rank.secretCode && !ALLOW_DIRECT_RANK_PURCHASE) {
    showNotification('This rank requires a code to unlock. Use the secret code dialog.', 'error');
    return;
  }

  // Non-secret ranks: process direct purchase via in-game credits/gems
  (async () => {
    try {
      const credits = await getUserCredits();
      if (rank.price > 0 && credits < rank.price) {
        showNotification('Not enough credits to purchase this rank.', 'error');
        return;
      }

      // Deduct credits if applicable
      if (rank.price > 0) {
        await updateUserCredits(-rank.price);
      }

      // Grant rank
      await saveUserRank(rank);
      room.updatePresence({
        rank: rank.name,
        color: rank.color,
        icon: rank.icon
      });
      showNotification(`Successfully purchased ${rank.name} rank!`, 'success');
    } catch (e) {
      console.error('Purchase failed', e);
      showNotification('Purchase failed due to an error.', 'error');
    }
  })();
}

// Add secret code prompt function
function promptSecretCode(rank) {
  // Only Mythic uses secret-code unlocking; ensure other secret staff ranks still work as before
  const code = prompt(`Enter secret code for ${rank.name} rank:`);
  if (!code) {
    showNotification('No code entered.', 'error');
    return;
  }

  if (code && code.toLowerCase().trim() === (rank.secretCode || '').toLowerCase()) {
    ensureRoomInitialized().then(async () => {
      try {
        // Persist unlock in DB (player_stats) and in room state userRanks, but do NOT allow shop purchase
        const currentUser = await window.websim.getCurrentUser();
        if (!currentUser) {
          showNotification('Could not verify user.', 'error');
          return;
        }

        // Update room state userRanks to include Mythic unlocked and equipped if AUTO_EQUIP_MYTHIC
        const userId = currentUser.id;
        const userRanks = room.roomState.userRanks || {};
        userRanks[userId] = {
          rank: rank.name,
          username: currentUser.username,
          color: rank.color,
          icon: rank.icon,
          mythic_unlocked: true,
          mythic_equipped: !!AUTO_EQUIP_MYTHIC,
          assignedAt: Date.now()
        };
        room.updateRoomState({ userRanks });

        // Persist to player_stats to make it survive reboots and be visible in queries
        const playerStatsCol = room.collection('player_stats');
        const existingList = await playerStatsCol.filter({ id: currentUser.id }).getList();
        const existing = existingList.length > 0 ? existingList[0] : { kills: 0, deaths: 0, highest_kill_streak: 0, rank: 'default' };
        await playerStatsCol.upsert({
          id: currentUser.id,
          username: currentUser.username,
          kills: existing.kills || 0,
          deaths: existing.deaths || 0,
          highest_kill_streak: existing.highest_kill_streak || 0,
          rank: 'Mythic',
          mythic_unlocked: true,
          mythic_equipped: !!AUTO_EQUIP_MYTHIC
        });

        // Update local presence and save rank if equipping
        if (AUTO_EQUIP_MYTHIC) {
          await saveUserRank(rank); // saveUserRank will update presence and DB
          showNotification(`Unlocked and equipped ${rank.name}!`, 'success');
        } else {
          showNotification(`Unlocked ${rank.name}! Use shop to equip it.`, 'success');
        }

        // Broadcast to others that this player unlocked Mythic (use system chat)
        room.send({
          type: 'chat',
          username: 'System',
          displayName: 'System',
          rank: 'default',
          message: `${currentUser.username} has unlocked §5§lMythic§r!`,
          timestamp: Date.now(),
          senderId: room.clientId
        });
      } catch (e) {
        console.error('Failed to unlock mythic', e);
        showNotification('Failed to unlock Mythic due to an error.', 'error');
      }
    });
  } else {
    showNotification('Invalid secret code for ' + rank.name + '.', 'error');
  }
}

async function promptGemCode() {
  const code = prompt('Enter a secret code to get gems:');
  if (code) {
    const normalizedCode = code.toLowerCase().trim();
    if (GEM_CODES[normalizedCode]) {
      const gemsAwarded = GEM_CODES[normalizedCode];
      await updateUserGems(gemsAwarded);
      showNotification(`You redeemed a code and got ${gemsAwarded} gems!`, 'success');
    } else {
      showNotification('Invalid secret code!', 'error');
    }
  }
}

// Admin events handler: render shutdown countdown, freeze on completion, run macros
function handleAdminEvents(events, playerControls) {
    if (shutdownInterval) {
        clearInterval(shutdownInterval);
        shutdownInterval = null;
    }
    const el = ensureShutdownBanner();
    const sortedEvents = (events || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = sortedEvents[0];
    
    if (!latest || !latest.active) { 
        if(el) el.style.display = 'none'; 
        return; 
    }

    if (latest.type === 'shutdown') {
        const start = new Date(latest.scheduled_at).getTime();
        const end = start + (Math.max(0, latest.seconds) * 1000);
        const tick = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((end - now) / 1000));
            if (remaining > 0) {
                el.textContent = `${latest.message} (${remaining}s)`;
                el.style.display = 'block';
            } else {
                el.textContent = 'Server is shutting down...';
                el.style.display = 'block';
                if (playerControls) playerControls.enabled = false;
                clearInterval(shutdownInterval);
                shutdownInterval = null;
            }
        };
        tick();
        shutdownInterval = setInterval(tick, 1000);
        return;
    }

    if (latest.type === 'macro' && latest.macro && MACROS[latest.macro]) {
        runMacro(latest.macro);
        // Deactivate event after running to prevent re-triggering
        room.collection('admin_events').update(latest.id, { active: false });
    }
}

// Function to open the shop
function openShop() {
    // Prevent opening multiple shops
    if (document.querySelector('.shop-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';

    /* @tweakable The title of the rank shop */
    const rankShopTitle = "RANKS SHOP";
    /* @tweakable The title for the staff ranks section */
    const staffRankTitle = "STAFF RANKS";

    // Helper to create the rank card HTML
    const createRankCard = (rank, isStaff = false) => {
        const iconHtml = `<div class="rank-icon-image ${rank.icon}-rank-icon" style="background-image: url('/${rank.icon}.png');"></div>`;
        const priceHtml = isStaff ? `<p class="rank-price">Secret Code</p>` : `<p class="rank-price">${rank.price} Credits</p>`;
        
        return `
            <div class="rank-card" data-rank-name="${rank.name}" data-secret="${isStaff}">
                <div class="rank-icon ${rank.icon}-rank-icon"></div>
                <h2 class="rank-name">${rank.name}</h2>
                ${priceHtml}
            </div>
        `;
    };

    overlay.innerHTML = `
        <div class="shop-container">
            <div class="shop-close">&times;</div>
            <h1 class="shop-title">${rankShopTitle}</h1>
            <div class="ranks-grid">
                ${shopRanks.map(rank => createRankCard(rank)).join('')}
            </div>
            <h2 class="shop-subtitle">${staffRankTitle}</h2>
            <div class="ranks-grid">
                ${staffRanks.map(rank => createRankCard(rank, true)).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Add event listeners for closing and purchasing
    overlay.querySelector('.shop-close').addEventListener('click', closeShop);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeShop();
    });

    overlay.querySelectorAll('.rank-card').forEach(card => {
        card.addEventListener('click', () => {
            const rankName = card.dataset.rankName;
            const isSecret = card.dataset.secret === 'true';
            const rankData = (isSecret ? staffRanks : shopRanks).find(r => r.name === rankName);
            
            if (rankData) {
                if (isSecret) {
                    promptSecretCode(rankData);
                } else {
                    purchaseRank(rankData);
                }
            }
        });
    });
}

// Execute predefined macro actions
function runMacro(name) {
  const actions = MACROS[name] || [];
  for (const action of actions) {
    switch (action.type) {
      case 'announce':
        setAnnouncement(action.message, action.color);
        // Also persist it as a regular announcement
        room.collection('announcement_events').create({ message: action.message, color: action.color || '#fff', removed: false });
        break;
      case 'clear_npcs': {
        room.updateRoomState({ npcs: {} });
        break;
      }
      case 'clear_timers': {
        room.updateRoomState({ timers: {} });
        break;
      }
      case 'heal_all': {
        Object.keys(room.presence || {}).forEach(cid => {
          room.requestPresenceUpdate(cid, { type: 'damage', amount: -Math.abs(action.amount || 100) }); // negative damage = heal
        });
        break;
      }
      default: break;
    }
  }
}

function showFlickerNightMessage() {
  const overlay = document.getElementById('flicker-night-overlay');
  const textElement = document.getElementById('flicker-night-text');
  const container = document.getElementById('flicker-night-container');
  const closeButton = document.getElementById('flicker-night-close');

  if (!overlay || !textElement || !container || !closeButton) return;

  // Set tweakable CSS variables
  overlay.style.setProperty('--flicker-duration', `${flickerAnimationDuration}s`);
  overlay.style.setProperty('--glitch-color', glitchTextColor);
  overlay.style.setProperty('--typing-duration', `${typingDuration}s`);
  overlay.style.setProperty('--typing-steps', FLICKER_NIGHT_MESSAGE.length);
  
  textElement.textContent = FLICKER_NIGHT_MESSAGE;
  overlay.classList.remove('hidden');

  const closeOverlay = () => {
    overlay.classList.add('hidden');
  };

  closeButton.onclick = closeOverlay;
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  };
}

// Ensure intro hides after configured timeout and before main menu appears
window.addEventListener('load', () => {
  if (!INTRO_ENABLED) {
    const el = document.getElementById('intro-overlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    // Run startup sequence then show main menu
    runStartupSequence().then(() => { hideIntroOverlay(); main(); });
    return;
  }
  setTimeout(async () => {
    hideIntroOverlay();
    // After the intro fades, run the startup sequence (fetching/ranks/loading) then show main menu
    await runStartupSequence();
    // Ensure main menu appears (main constructs menu)
    main();
  }, Math.max(0, INTRO_DURATION_MS));
});

// Creates a polished startup overlay and runs the three sequential progress phases
function runStartupSequence() {
  return new Promise((resolve) => {
    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'startup-overlay';
    overlay.style.cssText = `
      position: fixed; inset:0; display:flex; align-items:center; justify-content:center;
      background:#000; color:#fff; z-index:70000; flex-direction:column; gap:18px; font-family: Arial, sans-serif;
    `;
    overlay.innerHTML = `
      <div style="text-align:center; max-width:720px;">
        <div style="font-size:20px; font-weight:800; margin-bottom:8px;">Preparing game assets</div>
        <div id="phase-title" style="font-size:14px; opacity:.9; margin-bottom:10px;"></div>
        <div style="width:100%; background:rgba(255,255,255,0.06); border-radius:10px; padding:8px;">
          <div id="progress-bar" style="height:18px; width:0%; background:linear-gradient(90deg,#4ecdc4,#4ade80); border-radius:8px; transition:width .2s;"></div>
        </div>
        <div id="phase-sub" style="margin-top:10px; font-size:13px; opacity:.8;"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // phased animation helper
    const runPhase = (title, sub, durationMs, onTick) => {
      return new Promise(res => {
        const bar = document.getElementById('progress-bar');
        const titleEl = document.getElementById('phase-title');
        const subEl = document.getElementById('phase-sub');
        titleEl.textContent = title;
        subEl.textContent = sub;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / durationMs);
          const pct = Math.floor(t * 100);
          bar.style.width = pct + '%';
          if (onTick) onTick(t, pct);
          if (t < 1) requestAnimationFrame(step);
          else res();
        }
        requestAnimationFrame(step);
      });
    };

    (async () => {
      // Phase 1: Fetching files (reach 100% in FETCH_FILES_DURATION_MS)
      await runPhase('Fetching files...', `Downloading 100 items — completing in ${Math.round(FETCH_FILES_DURATION_MS/1000)}s`, FETCH_FILES_DURATION_MS);
      // brief pause/flourish
      await new Promise(r => setTimeout(r, 300));

      // Phase 2: Ranks downloading (10s default)
      await runPhase('Ranks downloading...', `Applying rank assets and icons — ${Math.round(RANKS_DOWNLOAD_DURATION_MS/1000)}s`, RANKS_DOWNLOAD_DURATION_MS);

      await new Promise(r => setTimeout(r, 300));

      // Phase 3: Loading (final game init)
      await runPhase('Loading game...', `Finalizing resources — ${Math.round(LOADING_PHASE_DURATION_MS/1000)}s`, LOADING_PHASE_DURATION_MS);

      // exit animation
      overlay.style.transition = 'opacity .6s, transform .6s';
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(0.98) translateY(-8px)';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve();
      }, 650);
    })();
  });
}

/* @tweakable Duration of "fetching files" phase in milliseconds */
const FETCH_FILES_DURATION_MS = 4000;
/* @tweakable Duration of "ranks downloading" phase in milliseconds */
const RANKS_DOWNLOAD_DURATION_MS = 10000;
/* @tweakable Duration of final "loading" phase in milliseconds */
const LOADING_PHASE_DURATION_MS = 15000;

/* @tweakable The username that will be auto-assigned full owner/admin privileges when they join (case-insensitive) */
const AUTO_OWNER_USERNAME = "CraftlessOP";

/* @tweakable Whether administrators are allowed to use symbols / emojis in tag names (non-alphanumeric). */
const TAG_ALLOW_SYMBOLS_FOR_ADMINS = true;

/* @tweakable Whether /tag invite auto-assigns the inviter's tag to the target instantly (true) or requires manual approval (false) */
const TAG_INVITE_AUTO_ACCEPT = true;

/* @tweakable Initial honor assigned to every player on first join */
const HONOR_INITIAL = 250;

/* @tweakable Honor thresholds and death-penalty ranges.
   Keys are minimum honor to use the range. Higher keys override lower ones.
   Each entry: [minLoss, maxLoss] applied to victim and transferred to killer. */
const HONOR_PENALTY_RANGES = {
  0: [10, 26],
  1000: [96, 124],
  2000: [260, 300],
  3000: [500, 700],
  5000: [800, 1300],
  10000: [2000, 3400]
};

// Helper: get current honor map (room state canonical)
async function getHonorMap() {
  if (!room) await ensureRoomInitialized();
  const honorMap = room.roomState?.honor || {};
  if (typeof honorMap !== 'object' || honorMap === null) return {};
  return honorMap;
}

// Helper: get a single user's honor (returns number)
async function getHonorForUser(userId) {
  const honorMap = await getHonorMap();
  return honorMap[userId] === undefined ? HONOR_INITIAL : honorMap[userId];
}

// Helper: persist honor change (zero-sum transfer handled outside)
async function setHonorForUser(userId, newValue) {
  if (!room) await ensureRoomInitialized();
  const honorMap = { ...(room.roomState?.honor || {}) };
  honorMap[userId] = Math.max(0, Math.floor(newValue));
  room.updateRoomState({ honor: honorMap });

  // Also persist to player_stats record for visibility
  try {
    const playerStatsCol = room.collection('player_stats');
    const existing = await playerStatsCol.filter({ id: userId }).getList();
    const existingStats = existing.length > 0 ? existing[0] : { id: userId, username: room.peers && room.peers[room.clientId] ? room.peers[room.clientId].username : userId, kills:0, deaths:0, highest_kill_streak:0, rank:'default' };
    await playerStatsCol.upsert({ ...existingStats, id: userId, username: existingStats.username, honor: honorMap[userId] || 0 });
  } catch (e) {
    console.warn('Failed to persist honor to player_stats', e);
  }
}

// Helper: choose penalty range based on victim honor
function getPenaltyRangeForHonor(honor) {
  // Find highest threshold <= honor
  const thresholds = Object.keys(HONOR_PENALTY_RANGES).map(n => parseInt(n, 10)).sort((a,b) => a - b);
  let chosen = 0;
  for (const t of thresholds) {
    if (honor >= t) chosen = t;
    else break;
  }
  return HONOR_PENALTY_RANGES[chosen] || HONOR_PENALTY_RANGES[0];
}

// Helper: compute random integer between min and max inclusive
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: update honor element for a display element (uses stable user id when possible)
/* @tweakable How often (ms) honor HUD auto-refresh should run for on-screen labels (0 disables periodic refresh) */
const HONOR_AUTO_REFRESH_MS = 5000;

async function setOrUpdateHonorDisplay(displayEl, clientIdOrUserId) {
  if (!displayEl) return;
  try {
    // Resolve stable user id from peers mapping if possible
    const peerEntries = Object.entries(room?.peers || {});
    // If passed a clientId and peers mapping has it, prefer the peer's stable user id
    let userId = clientIdOrUserId;
    if (room && room.peers && room.peers[clientIdOrUserId]?.id) {
      userId = room.peers[clientIdOrUserId].id;
    }
    const honorValue = await getHonorForUser(userId);
    const honorEl = displayEl.querySelector('.player-honor-display');
    if (honorEl) {
      honorEl.textContent = '❤ ' + (typeof honorValue === 'number' ? honorValue : HONOR_INITIAL);
    }
  } catch (e) {
    // silent fail — don't crash rendering
    console.warn('Failed to update honor display', e);
  }
}

// Periodically refresh visible honor displays (if enabled)
if (typeof window !== 'undefined') {
  if (HONOR_AUTO_REFRESH_MS > 0) {
    setInterval(() => {
      if (!room || !room.presence) return;
      for (const clientId in room.presence) {
        const label = document.getElementById(`rank-${clientId}`);
        if (label) setOrUpdateHonorDisplay(label, clientId);
        // Also try by stable user id entries in userRanks mapping
        const userRanks = room.roomState?.userRanks || {};
        for (const uid in userRanks) {
          const slabel = document.querySelector(`[id="rank-${uid}"]`);
          if (slabel) setOrUpdateHonorDisplay(slabel, uid);
        }
      }
      // Ensure local player label updates too
      const myLabel = document.getElementById(`rank-${room?.clientId}`);
      if (myLabel) setOrUpdateHonorDisplay(myLabel, room?.clientId);
    }, HONOR_AUTO_REFRESH_MS);
  }
}

// Add this function to hide the intro overlay
function hideIntroOverlay() {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  // remove after transition to avoid blocking clicks
  setTimeout(() => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 900);
}

/* @tweakable Whether rank purchases require entering a code (true/false). If true, all rank purchases use a secret-code prompt. */
const REQUIRE_CODE_FOR_RANK_PURCHASE = true;
/* @tweakable The message shown when asking player for a purchase code */
const RANK_CODE_PROMPT_MESSAGE = "Enter purchase code for this rank (leave empty to cancel):";
/* @tweakable Allow direct purchases without code for non-secret ranks (if true, price-based purchases are allowed) */
const ALLOW_DIRECT_RANK_PURCHASE = false;

// expose app helpers for tipHelpers (used by tipHelpers to apply ranks)
window.getRankData = getRankData;
window.saveUserRank = saveUserRank;
window.ensureRoomInitialized = ensureRoomInitialized;