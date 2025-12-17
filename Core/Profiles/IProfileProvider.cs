using System.Collections.Generic;
using System.Threading.Tasks;
using MacroEngine.Core.Models;

namespace MacroEngine.Core.Profiles
{
    /// <summary>
    /// Interface pour la gestion des profils de macros
    /// </summary>
    public interface IProfileProvider
    {
        /// <summary>
        /// Charge tous les profils
        /// </summary>
        Task<List<MacroProfile>> LoadProfilesAsync();

        /// <summary>
        /// Sauvegarde un profil
        /// </summary>
        Task<bool> SaveProfileAsync(MacroProfile profile);

        /// <summary>
        /// Supprime un profil
        /// </summary>
        Task<bool> DeleteProfileAsync(string profileId);

        /// <summary>
        /// Obtient un profil par son ID
        /// </summary>
        Task<MacroProfile> GetProfileAsync(string profileId);

        /// <summary>
        /// Active un profil
        /// </summary>
        Task<bool> ActivateProfileAsync(string profileId);

        /// <summary>
        /// Désactive le profil actif
        /// </summary>
        Task<bool> DeactivateProfileAsync();
    }
}

