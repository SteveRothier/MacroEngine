namespace MacroEngine.Core.Logging
{
    /// <summary>
    /// Interface pour les writers de logs (fichier, UI, etc.)
    /// </summary>
    public interface ILogWriter
    {
        /// <summary>
        /// Écrit une entrée de log
        /// </summary>
        /// <param name="entry">Entrée de log à écrire</param>
        void Write(LogEntry entry);

        /// <summary>
        /// Vérifie si le writer accepte ce niveau de log
        /// </summary>
        /// <param name="level">Niveau de log à vérifier</param>
        /// <returns>True si le niveau est accepté</returns>
        bool AcceptsLevel(LogLevel level);

        /// <summary>
        /// Libère les ressources du writer
        /// </summary>
        void Dispose();
    }
}

