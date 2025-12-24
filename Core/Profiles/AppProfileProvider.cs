using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Profiles
{
    /// <summary>
    /// Implémentation basée sur fichiers JSON pour la gestion des profils
    /// </summary>
    public class AppProfileProvider : IProfileProvider
    {
        private readonly string _profilesFilePath;
        private List<MacroProfile> _profiles;
        private MacroProfile? _activeProfile;

        public AppProfileProvider(string profilesFilePath = "Data/profiles.json")
        {
            _profilesFilePath = profilesFilePath;
            _profiles = new List<MacroProfile>();
        }

        public async Task<List<MacroProfile>> LoadProfilesAsync()
        {
            try
            {
                if (!File.Exists(_profilesFilePath))
                {
                    _profiles = new List<MacroProfile>();
                    return _profiles;
                }

                string json = await File.ReadAllTextAsync(_profilesFilePath);
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    WriteIndented = true
                };

                var profilesData = JsonSerializer.Deserialize<List<MacroProfileData>>(json, options);
                _profiles = profilesData?.Select(p => new MacroProfile
                {
                    Id = p.Id,
                    Name = p.Name,
                    Description = p.Description,
                    MacroIds = p.MacroIds ?? new List<string>(),
                    IsActive = p.IsActive,
                    Settings = p.Settings ?? new Dictionary<string, object>(),
                    CreatedAt = p.CreatedAt,
                    ModifiedAt = p.ModifiedAt
                }).ToList() ?? new List<MacroProfile>();

                _activeProfile = _profiles.FirstOrDefault(p => p.IsActive)!;

                return _profiles;
            }
            catch (Exception ex)
            {
                throw new Exception($"Erreur lors du chargement des profils: {ex.Message}", ex);
            }
        }

        public async Task<bool> SaveProfileAsync(MacroProfile profile)
        {
            try
            {
                if (profile == null)
                    return false;

                var existing = _profiles.FirstOrDefault(p => p.Id == profile.Id);
                if (existing != null)
                {
                    _profiles.Remove(existing);
                }

                profile.ModifiedAt = DateTime.Now;
                _profiles.Add(profile);

                await SaveAllProfilesAsync();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> DeleteProfileAsync(string profileId)
        {
            try
            {
                var profile = _profiles.FirstOrDefault(p => p.Id == profileId);
                if (profile == null)
                    return false;

                if (profile.IsActive)
                {
                    await DeactivateProfileAsync();
                }

                _profiles.Remove(profile);
                await SaveAllProfilesAsync();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public Task<MacroProfile> GetProfileAsync(string profileId)
        {
            var profile = _profiles.FirstOrDefault(p => p.Id == profileId);
            return Task.FromResult(profile!);
        }

        public async Task<bool> ActivateProfileAsync(string profileId)
        {
            try
            {
                await DeactivateProfileAsync();

                var profile = _profiles.FirstOrDefault(p => p.Id == profileId);
                if (profile == null)
                    return false;

                profile.IsActive = true;
                _activeProfile = profile;
                await SaveAllProfilesAsync();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> DeactivateProfileAsync()
        {
            try
            {
                if (_activeProfile != null)
                {
                    _activeProfile.IsActive = false;
                }

                foreach (var profile in _profiles.Where(p => p.IsActive))
                {
                    profile.IsActive = false;
                }

                _activeProfile = null!;
                await SaveAllProfilesAsync();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private async Task SaveAllProfilesAsync()
        {
            try
            {
                var directory = Path.GetDirectoryName(_profilesFilePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var profilesData = _profiles.Select(p => new MacroProfileData
                {
                    Id = p.Id,
                    Name = p.Name,
                    Description = p.Description,
                    MacroIds = p.MacroIds,
                    IsActive = p.IsActive,
                    Settings = p.Settings,
                    CreatedAt = p.CreatedAt,
                    ModifiedAt = p.ModifiedAt
                }).ToList();

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true
                };

                string json = JsonSerializer.Serialize(profilesData, options);
                await File.WriteAllTextAsync(_profilesFilePath, json);
            }
            catch (Exception ex)
            {
                throw new Exception($"Erreur lors de la sauvegarde des profils: {ex.Message}", ex);
            }
        }

        private class MacroProfileData
        {
            public string Id { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public List<string> MacroIds { get; set; } = new List<string>();
            public bool IsActive { get; set; }
            public Dictionary<string, object> Settings { get; set; } = new Dictionary<string, object>();
            public DateTime CreatedAt { get; set; }
            public DateTime ModifiedAt { get; set; }
        }
    }
}

