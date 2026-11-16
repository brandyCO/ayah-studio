# Wires Ayah Studio's own iPhone files into ios/App/App.xcodeproj (idempotent): the Swift plugins, the prayer sounds,
# the privacy manifest, the localized permission questions (*.lproj/InfoPlist.strings), the entitlements and the
# build settings (iPhone only, iOS 16.4+, alternate icons, Google client ids from the CI). Needs the xcodeproj gem
# (gem install xcodeproj). Run: ruby scripts/ios-project.rb
require 'xcodeproj'

path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(path)
target = project.targets.find { |t| t.name == 'App' }
group = project.main_group['App']

def file_in(group, name)
  group.files.find { |f| f.path == name } || group.new_reference(name)
end

%w[AyahBridgeViewController.swift AppIconPlugin.swift MediaScanPlugin.swift ExportServicePlugin.swift SpeechPlugin.swift HapticPlugin.swift].each do |n|
  ref = file_in(group, n)
  target.source_build_phase.add_file_reference(ref, true)
end
%w[prayer_adhan.caf prayer_chime.caf PrivacyInfo.xcprivacy].each do |n|
  ref = file_in(group, n)
  target.resources_build_phase.add_file_reference(ref, true)
end
file_in(group, 'App.entitlements')

# InfoPlist.strings as one localized variant group
variant = group.children.find { |c| c.isa == 'PBXVariantGroup' && c.name == 'InfoPlist.strings' }
unless variant
  variant = project.new(Xcodeproj::Project::Object::PBXVariantGroup)
  variant.name = 'InfoPlist.strings'
  variant.source_tree = '<group>'
  group.children << variant
end
dir = File.expand_path('../ios/App/App', __dir__)
Dir.glob(File.join(dir, '*.lproj', 'InfoPlist.strings')).sort.each do |f|
  lang = File.basename(File.dirname(f), '.lproj')
  rel = "#{lang}.lproj/InfoPlist.strings"
  next if variant.children.any? { |c| c.path == rel }
  ref = project.new(Xcodeproj::Project::Object::PBXFileReference)
  ref.name = lang
  ref.path = rel
  ref.last_known_file_type = 'text.plist.strings'
  ref.source_tree = '<group>'
  variant.children << ref
end
target.resources_build_phase.add_file_reference(variant, true)

langs = variant.children.map(&:name)
project.root_object.known_regions = (['en', 'Base'] + langs).uniq

icons = Dir.glob(File.join(dir, 'Assets.xcassets', 'AppIcon-*.appiconset')).map { |p| File.basename(p, '.appiconset') }.sort
target.build_configurations.each do |c|
  s = c.build_settings
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
  s['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  s['ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'] = icons.join(' ')
  s['ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS'] = 'NO'
  s['INFOPLIST_KEY_LSApplicationCategoryType'] = 'public.app-category.education'
  # Filled by the CI from repo variables (Google sign-in on the iPhone); harmless placeholders otherwise.
  s['GOOGLE_IOS_CLIENT_ID'] ||= 'none'
  s['GOOGLE_REVERSED_CLIENT_ID'] ||= 'com.brandyco.ayahstudio.nogoogle'
end
project.build_configurations.each { |c| c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4' }
project.save
puts "ok: #{icons.size} alternate icons, #{langs.size} languages"

# A shared "App" scheme, so the CI can build and archive it (xcodebuild -scheme App).
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(target, nil, launch_target: true)
scheme.archive_action.build_configuration = 'Release'
scheme.save_as(path, 'App', true)
puts 'scheme ok'
