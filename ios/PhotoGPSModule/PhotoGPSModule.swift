import Foundation
import Photos
import UIKit
import CoreLocation
import ImageIO
import PhotosUI

@objc(PhotoGPSModule)
class PhotoGPSModule: NSObject {
    
    // Method to check photo library permission status
    @objc(checkPhotoPermission:rejecter:)
    func checkPhotoPermission(resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch status {
        case .authorized:
            resolve("authorized")
        case .limited:
            resolve("limited")
        case .denied:
            resolve("denied")
        case .restricted:
            resolve("restricted")
        case .notDetermined:
            resolve("notDetermined")
        @unknown default:
            resolve("unknown")
        }
    }
    
    // Method to request photo library permission
    @objc(requestPhotoPermission:rejecter:)
    func requestPhotoPermission(resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            DispatchQueue.main.async {
                switch status {
                case .authorized:
                    resolve("authorized")
                case .limited:
                    resolve("limited")
                case .denied:
                    resolve("denied")
                case .restricted:
                    resolve("restricted")
                case .notDetermined:
                    resolve("notDetermined")
                @unknown default:
                    resolve("unknown")
                }
            }
        }
    }
    
    // Method to present photo picker and get selected photo with full metadata
    @objc(presentPhotoPicker:rejecter:)
    func presentPhotoPicker(resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            // Check if we can present the picker
            guard let rootViewController = UIApplication.shared.keyWindow?.rootViewController else {
                reject("no_root_vc", "Cannot access root view controller", nil)
                return
            }
            
            // Create a PHPickerConfiguration
            var configuration = PHPickerConfiguration(photoLibrary: PHPhotoLibrary.shared())
            configuration.selectionLimit = 1
            configuration.filter = .images
            
            // Create and present the picker
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            
            // Store the resolve and reject callbacks for later use
            self.currentResolver = resolve
            self.currentRejecter = reject
            
            rootViewController.present(picker, animated: true, completion: nil)
        }
    }
    
    // Method to extract GPS data from a photo using its local identifier
    @objc(extractGPSFromAsset:resolver:rejecter:)
    func extractGPSFromAsset(assetId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("PhotoGPS: Starting extractGPSFromAsset for ID: \(assetId)")
        
        // Perform PHAsset operations on a background queue to avoid blocking main thread
        DispatchQueue.global(qos: .userInitiated).async {
            // Create comprehensive fetch options for better reliability
            let fetchOptions = PHFetchOptions()
            fetchOptions.includeHiddenAssets = false
            fetchOptions.includeAllBurstPhotos = false
            // Force sync to avoid iCloud download delays
            fetchOptions.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared]
            
            print("PhotoGPS: Attempting to fetch PHAsset with enhanced options...")
            
            // Helper function to extract location from PHAsset with retry logic
            func extractLocationFromAsset(attempt: Int = 1) {
                print("PhotoGPS: Fetch attempt \(attempt)/5 for asset \(assetId)")
                
                // Use autoreleasepool to reduce memory pressure during repeated fetches
                autoreleasepool {
                    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: fetchOptions)
                guard let asset = fetchResult.firstObject else {
                    if attempt < 5 {  // Increased retry attempts
                        print("PhotoGPS: Asset not found on attempt \(attempt), retrying in \(0.3 * Double(attempt))s...")
                        // Use background queue for delays to avoid blocking
                        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + (0.3 * Double(attempt))) {
                            extractLocationFromAsset(attempt: attempt + 1)
                        }
                        return
                    } else {
                        print("PhotoGPS: ❌ Asset not found after 5 attempts")
                        DispatchQueue.main.async {
                            reject("not_found", "Asset not found with ID: \(assetId) after 5 attempts", nil)
                        }
                        return
                    }
                }
                
                print("PhotoGPS: ✅ Found asset on attempt \(attempt)")
                print("PhotoGPS: Asset details - mediaType: \(asset.mediaType.rawValue), sourceType: \(asset.sourceType.rawValue)")
                print("PhotoGPS: Asset creation date: \(asset.creationDate?.description ?? "unknown")")
                print("PhotoGPS: Asset modification date: \(asset.modificationDate?.description ?? "unknown")")
                print("PhotoGPS: Asset isFavorite: \(asset.isFavorite), isHidden: \(asset.isHidden)")
                
                // Force synchronous check to avoid race conditions
                let hasLocation = asset.location != nil
                print("PhotoGPS: Asset location check - hasLocation: \(hasLocation)")
                
                // Check if the asset has a location directly from PHAsset
                if let location = asset.location {
                    print("PhotoGPS: ✅ Successfully extracted location from PHAsset attempt \(attempt)")
                    print("PhotoGPS: Location details - lat: \(location.coordinate.latitude), lon: \(location.coordinate.longitude)")
                    print("PhotoGPS: Location accuracy: \(location.horizontalAccuracy)m, altitude: \(location.altitude)m")
                    print("PhotoGPS: Location timestamp: \(location.timestamp)")
                    
                    // Return the location data directly from PHAsset
                    let result: [String: Any] = [
                        "latitude": location.coordinate.latitude,
                        "longitude": location.coordinate.longitude,
                        "source": "phasset_enhanced_v2",
                        "altitude": location.altitude,
                        "accuracy": location.horizontalAccuracy,
                        "timestamp": location.timestamp.timeIntervalSince1970
                    ]
                    
                    DispatchQueue.main.async {
                        resolve(result)
                    }
                    return
                } else {
                    print("PhotoGPS: ❌ Asset location is nil on attempt \(attempt)")
                    
                    if attempt < 5 {  // Increased retry attempts for location check
                        print("PhotoGPS: Retrying location extraction in \(0.2 * Double(attempt))s...")
                        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + (0.2 * Double(attempt))) {
                            extractLocationFromAsset(attempt: attempt + 1)
                        }
                        return
                    } else {
                        print("PhotoGPS: ❌ No location found after 5 attempts, trying EXIF fallback...")
                        // Continue to EXIF fallback logic below
                        tryExifFallback(asset: asset)
                    }
                }
                } // autoreleasepool
            }
            
            // Start the extraction process
            extractLocationFromAsset()
        }
        
        // Helper function for EXIF fallback
        func tryExifFallback(asset: PHAsset) {
            print("PhotoGPS: Starting EXIF fallback extraction...")
            // If no location directly from PHAsset, try to extract from EXIF
            let options = PHContentEditingInputRequestOptions()
            options.isNetworkAccessAllowed = true  // Allow downloading from iCloud if needed
        
        asset.requestContentEditingInput(with: options) { (input, info) in
            guard let input = input,
                  let url = input.fullSizeImageURL else {
                reject("no_url", "Could not get image URL", nil)
                return
            }
            
            do {
                let imageData = try Data(contentsOf: url)
                guard let source = CGImageSourceCreateWithData(imageData as CFData, nil) else {
                    reject("source_error", "Could not create image source", nil)
                    return
                }
                
                // Get all image properties
                guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any] else {
                    reject("properties_error", "Could not get image properties", nil)
                    return
                }
                
                // Extract GPS dictionary
                guard let gpsDict = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any] else {
                    // No GPS data in this image
                    resolve(nil)
                    return
                }
                
                // Extract specific GPS data
                var result: [String: Any] = [:]
                
                if let latitude = gpsDict[kCGImagePropertyGPSLatitude as String] as? Double,
                   let latRef = gpsDict[kCGImagePropertyGPSLatitudeRef as String] as? String {
                    // Convert to signed latitude
                    let lat = latRef == "S" ? -latitude : latitude
                    result["latitude"] = lat
                }
                
                if let longitude = gpsDict[kCGImagePropertyGPSLongitude as String] as? Double,
                   let longRef = gpsDict[kCGImagePropertyGPSLongitudeRef as String] as? String {
                    // Convert to signed longitude
                    let long = longRef == "W" ? -longitude : longitude
                    result["longitude"] = long
                }
                
                // Check if we have coordinates
                if result["latitude"] != nil && result["longitude"] != nil {
                    result["source"] = "exif"
                    resolve(result)
                } else {
                    // No GPS data extracted
                    resolve(nil)
                }
            } catch {
                reject("io_error", "Error reading image data: \(error.localizedDescription)", nil)
            }
        }
        }
        
        // Start the extraction process
        extractLocationFromAsset()
    }
    
    // Method to extract GPS data directly from a file path (useful for camera photos)
    @objc(extractGPSFromPath:resolver:rejecter:)
    func extractGPSFromPath(path: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let url = URL(fileURLWithPath: path)
        
        do {
            let imageData = try Data(contentsOf: url)
            guard let source = CGImageSourceCreateWithData(imageData as CFData, nil) else {
                reject("source_error", "Could not create image source", nil)
                return
            }
            
            // Get all image properties
            guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any] else {
                reject("properties_error", "Could not get image properties", nil)
                return
            }
            
            // Extract GPS dictionary
            guard let gpsDict = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any] else {
                // No GPS data in this image
                resolve(nil)
                return
            }
            
            // Extract specific GPS data
            var result: [String: Any] = [:]
            
            if let latitude = gpsDict[kCGImagePropertyGPSLatitude as String] as? Double,
               let latRef = gpsDict[kCGImagePropertyGPSLatitudeRef as String] as? String {
                // Convert to signed latitude
                let lat = latRef == "S" ? -latitude : latitude
                result["latitude"] = lat
            }
            
            if let longitude = gpsDict[kCGImagePropertyGPSLongitude as String] as? Double,
               let longRef = gpsDict[kCGImagePropertyGPSLongitudeRef as String] as? String {
                // Convert to signed longitude
                let long = longRef == "W" ? -longitude : longitude
                result["longitude"] = long
            }
            
            // Check if we have coordinates
            if result["latitude"] != nil && result["longitude"] != nil {
                result["source"] = "exif"
                resolve(result)
            } else {
                // No GPS data extracted
                resolve(nil)
            }
        } catch {
            reject("io_error", "Error reading image data: \(error.localizedDescription)", nil)
        }
    }
    
    // Method to get current device location with configurable timeout
    @objc(getCurrentLocation:timeoutMs:resolver:rejecter:)
    func getCurrentLocation(timeoutMs: NSNumber?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let locationManager = CLLocationManager()
        locationManager.delegate = self
        
        // Store callbacks for later use
        self.locationResolver = resolve
        self.locationRejecter = reject
        
        // Use provided timeout or default to 5 seconds
        let timeoutSeconds = TimeInterval((timeoutMs?.doubleValue ?? 5000.0) / 1000.0)
        print("PhotoGPS: Starting location request with \(timeoutSeconds)s timeout")
        
        // Check current authorization status
        let authStatus = CLLocationManager.authorizationStatus()
        print("PhotoGPS: Current location authorization status: \(authStatus.rawValue)")
        
        // Request when-in-use authorization if needed
        if authStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if authStatus == .denied || authStatus == .restricted {
            reject("permission_denied", "Location access denied", nil)
            return
        }
        
        // Start updating location with optimized settings
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10.0 // Don't send updates for small movements
        locationManager.startUpdatingLocation()
        
        // Store the location manager to keep it alive
        self.currentLocationManager = locationManager
        
        // Set a timer to stop location updates after the specified timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds) { [weak self] in
            if let self = self, self.locationResolver != nil {
                print("PhotoGPS: Location request timed out after \(timeoutSeconds)s")
                self.currentLocationManager?.stopUpdatingLocation()
                self.currentLocationManager = nil
                self.locationRejecter?("timeout", "Location request timed out after \(timeoutSeconds)s", nil)
                self.locationResolver = nil
                self.locationRejecter = nil
            }
        }
    }
    
    // Required by RCTBridgeModule
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    // Private properties to store callbacks
    private var currentResolver: RCTPromiseResolveBlock?
    private var currentRejecter: RCTPromiseRejectBlock?
    private var locationResolver: RCTPromiseResolveBlock?
    private var locationRejecter: RCTPromiseRejectBlock?
    private var currentLocationManager: CLLocationManager?
}

// MARK: - PHPickerViewControllerDelegate
extension PhotoGPSModule: PHPickerViewControllerDelegate {
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        // Dismiss the picker
        picker.dismiss(animated: true)
        
        // Check if we have a result
        guard let result = results.first else {
            currentResolver?(nil) // User cancelled
            currentResolver = nil
            currentRejecter = nil
            return
        }
        
        // Get the asset identifier if available
        if result.assetIdentifier == nil {
            currentRejecter?("no_asset_id", "Selected image has no asset identifier", nil)
            currentResolver = nil
            currentRejecter = nil
            return
        }
        
        // Load the image data
        let itemProvider = result.itemProvider
        
        if itemProvider.canLoadObject(ofClass: UIImage.self) {
            // Start by loading the image so we have a URI to return
            itemProvider.loadObject(ofClass: UIImage.self) { [weak self] (object: Any?, error: Error?) in
                guard let strongSelf = self else { return }
                
                if let error = error {
                    DispatchQueue.main.async {
                        strongSelf.currentRejecter?("load_error", "Error loading image: \(error.localizedDescription)", nil)
                        strongSelf.currentResolver = nil
                        strongSelf.currentRejecter = nil
                    }
                    return
                }
                
                guard let image = object as? UIImage else {
                    DispatchQueue.main.async {
                        strongSelf.currentRejecter?("not_image", "Selected item is not an image", nil)
                        strongSelf.currentResolver = nil
                        strongSelf.currentRejecter = nil
                    }
                    return
                }
                
                // Save image to temporary directory
                let tempDir = NSTemporaryDirectory()
                let fileName = UUID().uuidString + ".jpg"
                let tempPath = (tempDir as NSString).appendingPathComponent(fileName)
                let tempURL = URL(fileURLWithPath: tempPath)
                
                // Convert image to JPEG data
                guard let imageData = image.jpegData(compressionQuality: 0.9) else {
                    DispatchQueue.main.async {
                        strongSelf.currentRejecter?("jpeg_error", "Error converting image to JPEG", nil)
                        strongSelf.currentResolver = nil
                        strongSelf.currentRejecter = nil
                    }
                    return
                }
                
                // Write to temp file
                do {
                    try imageData.write(to: tempURL)
                } catch {
                    DispatchQueue.main.async {
                        strongSelf.currentRejecter?("write_error", "Error writing image to temp file: \(error.localizedDescription)", nil)
                        strongSelf.currentResolver = nil
                        strongSelf.currentRejecter = nil
                    }
                    return
                }
                
                // Now get the PHAsset to extract GPS data
                guard let assetId = result.assetIdentifier else {
                    // We already checked this before, but double check
                    DispatchQueue.main.async {
                        // Still return the image path, but with no location
                        let resultDict: [String: Any] = [
                            "uri": tempURL.path,
                            "width": image.size.width,
                            "height": image.size.height,
                            "hasLocation": false
                        ]
                        strongSelf.currentResolver?(resultDict)
                        strongSelf.currentResolver = nil
                        strongSelf.currentRejecter = nil
                    }
                    return
                }
                
                // Fetch the PHAsset with enhanced options on background queue
                DispatchQueue.global(qos: .userInitiated).async {
                    let fetchOptions = PHFetchOptions()
                    fetchOptions.includeHiddenAssets = false
                    fetchOptions.includeAllBurstPhotos = false
                    fetchOptions.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared]
                    
                    print("PhotoGPS: Fetching PHAsset for picker with enhanced options...")
                    
                    // Retry logic for PHAsset fetch in picker
                    func fetchAssetWithRetry(attempt: Int = 1) {
                        print("PhotoGPS: Picker fetch attempt \(attempt)/3 for asset \(assetId)")
                        
                        autoreleasepool {
                            let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: fetchOptions)
                        guard let asset = fetchResult.firstObject else {
                            if attempt < 3 {
                                print("PhotoGPS: Picker asset not found on attempt \(attempt), retrying...")
                                DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + (0.5 * Double(attempt))) {
                                    fetchAssetWithRetry(attempt: attempt + 1)
                                }
                                return
                            } else {
                                print("PhotoGPS: Could not fetch PHAsset for ID: \(assetId) after 3 attempts")
                                DispatchQueue.main.async {
                                    let resultDict: [String: Any] = [
                                        "uri": tempURL.path,
                                        "width": image.size.width,
                                        "height": image.size.height,
                                        "hasLocation": false,
                                        "assetId": assetId
                                    ]
                                    strongSelf.currentResolver?(resultDict)
                                    strongSelf.currentResolver = nil
                                    strongSelf.currentRejecter = nil
                                }
                                return
                            }
                        }
                        
                        print("PhotoGPS: ✅ Successfully fetched PHAsset for picker on attempt \(attempt)")
                        print("PhotoGPS: Asset creation date: \(asset.creationDate?.description ?? "unknown")")
                        print("PhotoGPS: Asset sourceType: \(asset.sourceType.rawValue)")
                        
                        let hasLocation = asset.location != nil
                        print("PhotoGPS: Picker asset has location: \(hasLocation)")
                        
                        // Extract location from the PHAsset if available
                        if let location = asset.location {
                            print("PhotoGPS: ✅ Found location in PHAsset picker: \(location.coordinate.latitude), \(location.coordinate.longitude)")
                            print("PhotoGPS: Location accuracy: \(location.horizontalAccuracy)m, timestamp: \(location.timestamp)")
                            
                            DispatchQueue.main.async {
                                let resultDict: [String: Any] = [
                                    "uri": tempURL.path,
                                    "width": image.size.width,
                                    "height": image.size.height,
                                    "hasLocation": true,
                                    "location": [
                                        "latitude": location.coordinate.latitude,
                                        "longitude": location.coordinate.longitude,
                                        "source": "phasset_picker_v2",
                                        "altitude": location.altitude,
                                        "accuracy": location.horizontalAccuracy,
                                        "timestamp": location.timestamp.timeIntervalSince1970
                                    ],
                                    "assetId": assetId
                                ]
                                strongSelf.currentResolver?(resultDict)
                                strongSelf.currentResolver = nil
                                strongSelf.currentRejecter = nil
                            }
                            return
                        } else {
                            print("PhotoGPS: ❌ PHAsset location is nil in picker on attempt \(attempt)")
                            
                            if attempt < 3 {
                                print("PhotoGPS: Retrying picker location extraction...")
                                DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + (0.3 * Double(attempt))) {
                                    fetchAssetWithRetry(attempt: attempt + 1)
                                }
                                return
                            } else {
                                print("PhotoGPS: No location found in picker after 3 attempts, trying EXIF fallback...")
                                // Continue to EXIF fallback below
                                tryExifInPicker(asset: asset)
                            }
                        }
                        } // autoreleasepool
                    }
                    
                    // Helper function for EXIF in picker
                    func tryExifInPicker(asset: PHAsset) {
                        print("PhotoGPS: Starting EXIF fallback in picker...")
                        let options = PHContentEditingInputRequestOptions()
                        options.isNetworkAccessAllowed = true
                        
                        asset.requestContentEditingInput(with: options) { (input, info) in
                    if let input = input, let url = input.fullSizeImageURL {
                        do {
                            let imageData = try Data(contentsOf: url)
                            guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
                                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
                                  let gpsDict = properties[kCGImagePropertyGPSDictionary as String] as? [String: Any] else {
                                
                                // No EXIF data, just return the image without location
                                DispatchQueue.main.async {
                                    let resultDict: [String: Any] = [
                                        "uri": tempURL.path,
                                        "width": image.size.width,
                                        "height": image.size.height,
                                        "hasLocation": false,
                                        "assetId": assetId
                                    ]
                                    strongSelf.currentResolver?(resultDict)
                                    strongSelf.currentResolver = nil
                                    strongSelf.currentRejecter = nil
                                }
                                return
                            }
                            
                            // Extract GPS data
                            var locationData: [String: Any] = [:]
                            var hasCoordinates = false
                            
                            if let latitude = gpsDict[kCGImagePropertyGPSLatitude as String] as? Double,
                               let latRef = gpsDict[kCGImagePropertyGPSLatitudeRef as String] as? String {
                                let lat = latRef == "S" ? -latitude : latitude
                                locationData["latitude"] = lat
                                hasCoordinates = true
                            }
                            
                            if let longitude = gpsDict[kCGImagePropertyGPSLongitude as String] as? Double,
                               let longRef = gpsDict[kCGImagePropertyGPSLongitudeRef as String] as? String {
                                let long = longRef == "W" ? -longitude : longitude
                                locationData["longitude"] = long
                                hasCoordinates = true
                            }
                            
                            if hasCoordinates {
                                locationData["source"] = "exif"
                            }
                            
                            DispatchQueue.main.async {
                                let resultDict: [String: Any] = [
                                    "uri": tempURL.path,
                                    "width": image.size.width,
                                    "height": image.size.height,
                                    "hasLocation": hasCoordinates,
                                    "location": hasCoordinates ? locationData : nil,
                                    "assetId": assetId
                                ]
                                strongSelf.currentResolver?(resultDict)
                                strongSelf.currentResolver = nil
                                strongSelf.currentRejecter = nil
                            }
                        } catch {
                            // Error reading EXIF data, just return the image without location
                            DispatchQueue.main.async {
                                let resultDict: [String: Any] = [
                                    "uri": tempURL.path,
                                    "width": image.size.width,
                                    "height": image.size.height,
                                    "hasLocation": false,
                                    "assetId": assetId
                                ]
                                strongSelf.currentResolver?(resultDict)
                                strongSelf.currentResolver = nil
                                strongSelf.currentRejecter = nil
                            }
                        }
                    } else {
                        // No input or URL, just return the image without location
                        DispatchQueue.main.async {
                            let resultDict: [String: Any] = [
                                "uri": tempURL.path,
                                "width": image.size.width,
                                "height": image.size.height,
                                "hasLocation": false,
                                "assetId": assetId
                            ]
                            strongSelf.currentResolver?(resultDict)
                            strongSelf.currentResolver = nil
                            strongSelf.currentRejecter = nil
                        }
                    }
                    
                    // Start the retry process
                    fetchAssetWithRetry()
                }
            }
            }
        } else {
            currentRejecter?("cannot_load", "Cannot load image from selected item", nil)
            currentResolver = nil
            currentRejecter = nil
        }
    }
}

// MARK: - CLLocationManagerDelegate
extension PhotoGPSModule: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, let resolver = locationResolver else { return }
        
        print("PhotoGPS: Successfully got location: \(location.coordinate.latitude), \(location.coordinate.longitude) (accuracy: \(location.horizontalAccuracy)m)")
        
        // Stop updating location
        manager.stopUpdatingLocation()
        currentLocationManager = nil
        
        // Resolve with the location data
        let result: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "altitude": location.altitude,
            "accuracy": location.horizontalAccuracy,
            "source": "device"
        ]
        resolver(result)
        
        // Clear callbacks
        locationResolver = nil
        locationRejecter = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let rejecter = locationRejecter else { return }
        
        print("PhotoGPS: Location manager failed with error: \(error.localizedDescription)")
        
        // Stop updating location
        manager.stopUpdatingLocation()
        currentLocationManager = nil
        
        // Reject with the error
        rejecter("location_error", "Error getting location: \(error.localizedDescription)", error)
        
        // Clear callbacks
        locationResolver = nil
        locationRejecter = nil
    }
    
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        print("PhotoGPS: Location authorization changed to: \(status.rawValue)")
        
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            // Authorization granted, location manager will start automatically
            break
        case .denied, .restricted:
            if let rejecter = locationRejecter {
                rejecter("permission_denied", "Location access denied", nil)
                locationResolver = nil
                locationRejecter = nil
                currentLocationManager?.stopUpdatingLocation()
                currentLocationManager = nil
            }
        case .notDetermined:
            // Still waiting for user response
            break
        @unknown default:
            break
        }
    }
}