namespace WorldWeaver.Assembly
{
    /// <summary>
    /// Pluggable world-building step. Add new modules to extend procedural generation.
    /// </summary>
    public interface IWorldWeaverModule
    {
        int Order { get; }
        void Build(Core.WorldWeaverBuildContext context);
    }
}
