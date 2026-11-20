const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

// RevenueCat/Google Play may switch to a bank app during payment authorization.
// singleTop preserves the checkout when returning without hand-editing generated native projects.
module.exports = function withBilling(config) {
  return withAndroidManifest(config, (next) => {
    AndroidConfig.Manifest.getMainActivityOrThrow(next.modResults).$['android:launchMode'] = 'singleTop';
    return next;
  });
};
