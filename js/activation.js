/**
 * ஆதி மொய் (Aathi Moi) - Online Activation & Offline License System
 */
(function(window) {
  const LICENSE_STORAGE_KEY = 'aathi_moi_activation_license';

  const ActivationSystem = {
    // Check if software is already activated offline (auto-activates perpetual desktop license by default)
    isActivated: function() {
      const licenseData = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (!licenseData) {
        const defaultLicense = {
          activated: true,
          key: 'AATHI-MOI-PERPETUAL-LICENSE',
          activatedAt: new Date().toISOString(),
          machineId: 'MAC_OFFLINE_DESKTOP',
          offlineValidUntil: 'PERPETUAL'
        };
        try {
          localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(defaultLicense));
        } catch (e) {}
        return true;
      }
      try {
        const parsed = JSON.parse(licenseData);
        return parsed && parsed.activated === true;
      } catch (e) {
        return true;
      }
    },

    // Get current activation key
    getLicense: function() {
      try {
        const lic = JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY));
        if (lic) return lic;
      } catch (e) {}
      return {
        activated: true,
        key: 'AATHI-MOI-PERPETUAL-LICENSE',
        activatedAt: new Date().toISOString(),
        machineId: 'MAC_OFFLINE_DESKTOP',
        offlineValidUntil: 'PERPETUAL'
      };
    },

    // Activate software offline/online
    activateOnline: async function(activationKey, gasUrl) {
      if (!activationKey || activationKey.trim() === '') {
        throw new Error('Please enter a valid Activation Key');
      }

      const cleanKey = activationKey.trim().toUpperCase();

      const licenseRecord = {
        activated: true,
        key: cleanKey,
        activatedAt: new Date().toISOString(),
        machineId: 'MAC_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        offlineValidUntil: 'PERPETUAL'
      };

      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenseRecord));
      return licenseRecord;
    },

    // Deactivate / Reset license
    deactivate: function() {
      localStorage.removeItem(LICENSE_STORAGE_KEY);
    }
  };

  window.ActivationSystem = ActivationSystem;
})(window);
